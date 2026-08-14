"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin/guard";
import { revokeAllVerifiedAdminSessions, revokeCurrentVerifiedAdminSession } from "@/lib/admin/verified-session";
import { createClient } from "@/lib/supabase/server";

async function audit(admin: Awaited<ReturnType<typeof requireSuperadmin>>["admin"], userId: string, action: string, resourceType: string, resourceId?: string | null, metadata?: Record<string, unknown>) {
  const { error } = await admin.schema("audit").from("audit_logs").insert({
    actor_user_id: userId,
    actor_type: "superadmin",
    action,
    resource_type: resourceType,
    resource_id: resourceId || null,
    metadata: metadata ?? {},
  });
  if (error) throw error;
}

export async function setIncidentMode(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const mode = String(formData.get("mode") ?? "normal");
  if (!["normal", "degraded", "maintenance", "security_lockdown"].includes(mode)) throw new Error("Invalid mode");
  const patch = mode === "security_lockdown"
    ? { incident_mode: mode, agents_enabled: false, external_tools_enabled: false, sandbox_scheduling_enabled: false, external_network_enabled: false, updated_by: userId }
    : { incident_mode: mode, updated_by: userId };
  const { error } = await admin.schema("operations").from("system_state").update(patch).eq("singleton", true);
  if (error) throw error;
  await audit(admin, userId, "platform.incident_mode_changed", "platform_state", null, { mode });
  revalidatePath("/admin");
  revalidatePath("/admin/platform");
}

export async function setOrganizationStatus(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const organizationId = String(formData.get("organization_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!organizationId || !["active", "paused", "archived"].includes(status)) throw new Error("Invalid organization update");
  const { data: before, error: readError } = await admin.schema("app").from("organizations").select("id,status,name").eq("id", organizationId).maybeSingle();
  if (readError || !before) throw readError ?? new Error("Organization not found");
  const { error } = await admin.schema("app").from("organizations").update({ status, updated_at: new Date().toISOString() }).eq("id", organizationId);
  if (error) throw error;
  await audit(admin, userId, "organization.status_changed", "organization", organizationId, { from: before.status, to: status, name: before.name });
  revalidatePath("/admin/organizations");
  revalidatePath("/admin");
}

export async function markWaitlistInvited(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const entryId = String(formData.get("entry_id") ?? "");
  if (!entryId) throw new Error("Missing waitlist entry");
  const { data: entry, error: readError } = await admin.schema("launch").from("waitlist_entries").select("id,email,status,email_verified_at").eq("id", entryId).maybeSingle();
  if (readError || !entry) throw readError ?? new Error("Waitlist entry not found");
  if (!entry.email_verified_at || entry.status !== "verified") throw new Error("Only verified waitlist entries can be marked invited");
  const now = new Date().toISOString();
  const { error } = await admin.schema("launch").from("waitlist_entries").update({ status: "invited", invited_at: now, updated_at: now }).eq("id", entryId).eq("status", "verified");
  if (error) throw error;
  await audit(admin, userId, "waitlist.entry_marked_invited", "waitlist_entry", entryId, { email: entry.email });
  revalidatePath("/admin/waitlist");
  revalidatePath("/admin");
}

export async function setFeatureFlag(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const flagId = String(formData.get("flag_id") ?? "");
  const enabled = String(formData.get("enabled") ?? "false") === "true";
  if (!flagId) throw new Error("Missing feature flag");
  const { data: flag, error: readError } = await admin.schema("operations").from("feature_flags").select("id,key,enabled,scope_type,scope_id").eq("id", flagId).maybeSingle();
  if (readError || !flag) throw readError ?? new Error("Feature flag not found");
  const { error } = await admin.schema("operations").from("feature_flags").update({ enabled, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", flagId);
  if (error) throw error;
  await audit(admin, userId, "feature_flag.changed", "feature_flag", flagId, { key: flag.key, from: flag.enabled, to: enabled, scope_type: flag.scope_type, scope_id: flag.scope_id });
  revalidatePath("/admin/feature-flags");
}

export async function retryFailedJob(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const jobId = String(formData.get("job_id") ?? "");
  if (!jobId) throw new Error("Missing job");
  const { data: job, error: readError } = await admin.schema("operations").from("jobs").select("id,status,queue_name,attempt_count,max_attempts").eq("id", jobId).maybeSingle();
  if (readError || !job) throw readError ?? new Error("Job not found");
  if (!["failed", "dead_letter"].includes(String(job.status))) throw new Error("Only failed jobs can be retried");
  const { error } = await admin.schema("operations").from("jobs").update({
    status: "queued", available_at: new Date().toISOString(), lease_owner: null, lease_expires_at: null, last_error: null, completed_at: null, updated_at: new Date().toISOString(),
  }).eq("id", jobId).in("status", ["failed", "dead_letter"]);
  if (error) throw error;
  await audit(admin, userId, "job.retry_requested", "job", jobId, { queue: job.queue_name, previous_status: job.status, attempt_count: job.attempt_count, max_attempts: job.max_attempts });
  revalidatePath("/admin/jobs");
  revalidatePath("/admin");
}

export async function cancelQueuedJob(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const jobId = String(formData.get("job_id") ?? "");
  if (!jobId) throw new Error("Missing job");
  const { data: job, error: readError } = await admin.schema("operations").from("jobs").select("id,status,queue_name").eq("id", jobId).maybeSingle();
  if (readError || !job) throw readError ?? new Error("Job not found");
  if (job.status !== "queued") throw new Error("Only queued jobs can be cancelled from Superadmin");
  const now = new Date().toISOString();
  const { error } = await admin.schema("operations").from("jobs").update({ status: "cancelled", completed_at: now, updated_at: now }).eq("id", jobId).eq("status", "queued");
  if (error) throw error;
  await audit(admin, userId, "job.cancelled", "job", jobId, { queue: job.queue_name });
  revalidatePath("/admin/jobs");
  revalidatePath("/admin");
}

export async function setUserSuspension(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const targetUserId = String(formData.get("user_id") ?? "");
  const suspended = String(formData.get("suspended") ?? "false") === "true";
  if (!targetUserId) throw new Error("Missing user");
  if (targetUserId === userId) throw new Error("You cannot suspend your own Superadmin session");

  const { data: profile } = await admin.schema("app").from("profiles").select("is_superadmin").eq("id", targetUserId).maybeSingle();
  if (profile?.is_superadmin) throw new Error("Superadmin accounts cannot be suspended from this control");

  const { data: before, error: userError } = await admin.auth.admin.getUserById(targetUserId);
  if (userError || !before.user) throw userError ?? new Error("User not found");

  const { error } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: suspended ? "876000h" : "none" });
  if (error) throw error;
  await audit(admin, userId, suspended ? "user.suspended" : "user.restored", "user", targetUserId, { email: before.user.email ?? null });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function changeAdminPassword(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  if (password.length < 16 || password.length > 128 || password !== confirmPassword) {
    redirect("/admin/account?error=password_rules");
  }

  const client = await createClient();
  const { data: claims } = await client.auth.getClaims();
  const issuedAt = Number(claims?.claims?.iat ?? 0);
  if (!issuedAt || Math.floor(Date.now() / 1000) - issuedAt > 30 * 60) {
    redirect("/admin-login?error=reauth_required");
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) redirect("/admin/account?error=password_update");

  await audit(admin, userId, "admin.password_changed", "admin_account", userId, { sessions_revoked: true });
  await revokeAllVerifiedAdminSessions(admin, userId);
  await client.auth.signOut({ scope: "global" });
  redirect("/admin-login?password=updated");
}

export async function signOutAdmin() {
  const { admin, userId } = await requireSuperadmin();
  const client = await createClient();
  await audit(admin, userId, "admin.signed_out", "admin_session", userId);
  await revokeCurrentVerifiedAdminSession(admin, userId);
  await client.auth.signOut({ scope: "local" });
  redirect("/admin-login");
}
