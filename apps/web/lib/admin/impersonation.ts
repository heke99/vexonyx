import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin/guard";

export const ADMIN_PREVIEW_COOKIE = "vexonyx_admin_preview";
export const ADMIN_PREVIEW_COOKIE_PATH = "/preview";
export const ADMIN_PREVIEW_TTL_MINUTES = 15;

export function hashPreviewToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function clearPreviewCookie() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_PREVIEW_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: ADMIN_PREVIEW_COOKIE_PATH,
    maxAge: 0,
  });
}

export async function requireUserPreview(targetUserId: string) {
  const { admin, userId: actorUserId } = await requireSuperadmin();
  const token = (await cookies()).get(ADMIN_PREVIEW_COOKIE)?.value;
  if (!token) redirect(`/admin/users/${targetUserId}?preview=expired`);

  const tokenHash = hashPreviewToken(token);
  const { data: session, error } = await admin
    .schema("security")
    .from("admin_impersonation_sessions")
    .select("id,actor_user_id,target_user_id,organization_id,reason,created_at,expires_at,ended_at")
    .eq("token_hash", tokenHash)
    .eq("actor_user_id", actorUserId)
    .eq("target_user_id", targetUserId)
    .is("ended_at", null)
    .maybeSingle();

  if (error || !session || new Date(session.expires_at).getTime() <= Date.now()) {
    if (session?.id && !session.ended_at) {
      await admin.schema("security").from("admin_impersonation_sessions").update({ ended_at: new Date().toISOString(), ended_reason: "expired" }).eq("id", session.id);
    }
    await clearPreviewCookie();
    redirect(`/admin/users/${targetUserId}?preview=expired`);
  }

  const [{ data: targetProfile }, { data: membership }, auth] = await Promise.all([
    admin.schema("app").from("profiles").select("id,display_name,is_superadmin,account_kind").eq("id", targetUserId).maybeSingle(),
    admin.schema("app").from("organization_members").select("organization_id,role").eq("organization_id", session.organization_id).eq("user_id", targetUserId).maybeSingle(),
    admin.auth.admin.getUserById(targetUserId),
  ]);

  if (!targetProfile || targetProfile.is_superadmin || !membership || auth.error || !auth.data.user) {
    await admin.schema("security").from("admin_impersonation_sessions").update({ ended_at: new Date().toISOString(), ended_reason: "target_no_longer_eligible" }).eq("id", session.id);
    await clearPreviewCookie();
    redirect(`/admin/users/${targetUserId}?preview=invalid`);
  }

  await admin.schema("security").from("admin_impersonation_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", session.id);

  return {
    admin,
    actorUserId,
    targetUserId,
    organizationId: session.organization_id as string,
    targetEmail: auth.data.user.email ?? targetUserId,
    targetDisplayName: targetProfile.display_name as string | null,
    accountKind: targetProfile.account_kind as string,
    expiresAt: session.expires_at as string,
    sessionId: session.id as string,
  };
}
