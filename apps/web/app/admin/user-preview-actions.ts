"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin/guard";
import { ADMIN_PREVIEW_COOKIE, ADMIN_PREVIEW_COOKIE_PATH, ADMIN_PREVIEW_TTL_MINUTES, hashPreviewToken } from "@/lib/admin/impersonation";

const DEMO_EMAIL = "demo@vexonyx.com";
const DEMO_APP_METADATA = { vexonyx_internal_provisioning: "demo" } as const;
const DEMO_USER_METADATA = { display_name: "VEXONYX Demo", account_kind: "demo" } as const;

async function audit(admin: Awaited<ReturnType<typeof requireSuperadmin>>["admin"], actorUserId: string, action: string, resourceId: string | null, metadata: Record<string, unknown>, organizationId?: string | null) {
  await admin.schema("audit").from("audit_logs").insert({
    organization_id: organizationId ?? null,
    actor_user_id: actorUserId,
    actor_type: "superadmin",
    action,
    resource_type: "user_preview",
    resource_id: resourceId,
    metadata,
  });
}

export async function provisionDemoUser(formData: FormData) {
  const { admin, userId: actorUserId } = await requireSuperadmin();
  const password = String(formData.get("password") ?? "");
  if (password.length < 16 || password.length > 128) throw new Error("Demo password must be 16–128 characters.");

  const lookup = await admin.schema("app").rpc("get_demo_user_id");
  if (lookup.error) throw lookup.error;
  const existingDemoUserId = typeof lookup.data === "string" ? lookup.data : null;
  let demoUser = null;

  if (existingDemoUserId) {
    const existing = await admin.auth.admin.getUserById(existingDemoUserId);
    if (existing.error || !existing.data.user) throw existing.error ?? new Error("Could not load demo user.");
    demoUser = existing.data.user;
    const updated = await admin.auth.admin.updateUserById(demoUser.id, {
      password,
      email_confirm: true,
      user_metadata: DEMO_USER_METADATA,
      app_metadata: { ...(demoUser.app_metadata ?? {}), ...DEMO_APP_METADATA },
    });
    if (updated.error) throw updated.error;
  } else {
    const issued = await admin.schema("app").rpc("issue_demo_auth_creation_token");
    if (issued.error || typeof issued.data !== "string" || issued.data.length < 32) {
      throw issued.error ?? new Error("Could not authorize demo user creation.");
    }

    const created = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { ...DEMO_USER_METADATA, vexonyx_demo_provisioning_token: issued.data },
      app_metadata: DEMO_APP_METADATA,
    });
    if (created.error || !created.data.user) throw created.error ?? new Error("Could not create demo user.");
    demoUser = created.data.user;

    const scrubbed = await admin.auth.admin.updateUserById(demoUser.id, {
      user_metadata: DEMO_USER_METADATA,
      app_metadata: { ...(demoUser.app_metadata ?? {}), ...DEMO_APP_METADATA },
    });
    if (scrubbed.error) throw scrubbed.error;
  }

  const provisioned = await admin.schema("app").rpc("provision_demo_account", { p_user_id: demoUser.id });
  if (provisioned.error) throw provisioned.error;
  const organizationId = typeof provisioned.data === "string" ? provisioned.data : null;

  await audit(admin, actorUserId, "demo_account.provisioned", demoUser.id, { email: DEMO_EMAIL, synthetic: true }, organizationId);
  redirect(`/admin/users/${demoUser.id}`);
}

export async function startUserPreview(formData: FormData) {
  const { admin, userId: actorUserId } = await requireSuperadmin();
  const targetUserId = String(formData.get("user_id") ?? "");
  const reason = String(formData.get("reason") ?? "Dashboard support preview").trim().slice(0, 500);
  if (!targetUserId || targetUserId === actorUserId) throw new Error("Invalid preview target.");
  if (reason.length < 3) throw new Error("Preview reason is required.");

  const [auth, profile, membership] = await Promise.all([
    admin.auth.admin.getUserById(targetUserId),
    admin.schema("app").from("profiles").select("id,is_superadmin").eq("id", targetUserId).maybeSingle(),
    admin.schema("app").from("organization_members").select("organization_id,role").eq("user_id", targetUserId).limit(1).maybeSingle(),
  ]);
  if (auth.error || !auth.data.user || !profile.data || profile.data.is_superadmin || !membership.data) throw new Error("User is not eligible for preview.");

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashPreviewToken(rawToken);
  const expiresAt = new Date(Date.now() + ADMIN_PREVIEW_TTL_MINUTES * 60_000).toISOString();

  await admin.schema("security").from("admin_impersonation_sessions").update({ ended_at: new Date().toISOString(), ended_reason: "replaced" }).eq("actor_user_id", actorUserId).is("ended_at", null);
  const inserted = await admin.schema("security").from("admin_impersonation_sessions").insert({ token_hash: tokenHash, actor_user_id: actorUserId, target_user_id: targetUserId, organization_id: membership.data.organization_id, reason, expires_at: expiresAt }).select("id").single();
  if (inserted.error) throw inserted.error;

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_PREVIEW_COOKIE, rawToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: ADMIN_PREVIEW_COOKIE_PATH, maxAge: ADMIN_PREVIEW_TTL_MINUTES * 60 });
  await audit(admin, actorUserId, "user_preview.started", targetUserId, { session_id: inserted.data.id, expires_at: expiresAt, reason }, membership.data.organization_id);
  redirect(`/preview/users/${targetUserId}`);
}

export async function stopUserPreview(formData: FormData) {
  const { admin, userId: actorUserId } = await requireSuperadmin();
  const targetUserId = String(formData.get("user_id") ?? "");
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_PREVIEW_COOKIE)?.value;
  if (token) {
    const tokenHash = hashPreviewToken(token);
    const { data: session } = await admin.schema("security").from("admin_impersonation_sessions").select("id,target_user_id,organization_id").eq("token_hash", tokenHash).eq("actor_user_id", actorUserId).is("ended_at", null).maybeSingle();
    if (session) {
      await admin.schema("security").from("admin_impersonation_sessions").update({ ended_at: new Date().toISOString(), ended_reason: "admin_exit" }).eq("id", session.id);
      await audit(admin, actorUserId, "user_preview.ended", session.target_user_id, { session_id: session.id }, session.organization_id);
    }
  }
  cookieStore.set(ADMIN_PREVIEW_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: ADMIN_PREVIEW_COOKIE_PATH, maxAge: 0 });
  redirect(targetUserId ? `/admin/users/${targetUserId}` : "/admin/users");
}
