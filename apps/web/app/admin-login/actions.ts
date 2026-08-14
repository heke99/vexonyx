"use server";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createEmailProvider } from "@/lib/email/provider";
import { createVerifiedAdminSession, revokeAllVerifiedAdminSessions } from "@/lib/admin/verified-session";

const ADMIN_CHALLENGE_COOKIE = "vx_admin_challenge";
const CHALLENGE_TTL_SECONDS = 10 * 60;
const MAX_OTP_ATTEMPTS = 5;
const MAX_PASSWORD_FAILURES = 5;

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type ChallengePurpose = "login" | "password_reset";
type ChallengeRow = {
  id: string;
  purpose: ChallengePurpose;
  user_id: string;
  email_hash: string;
  browser_secret_hash: string;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(formData: FormData) {
  return String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 320);
}

function validPassword(password: string) {
  return password.length >= 16 && password.length <= 128;
}

async function authAudit(admin: AdminClient, action: string, metadata: Record<string, unknown>) {
  await admin.schema("audit").from("audit_logs").insert({
    actor_type: "system",
    action,
    resource_type: "admin_auth",
    metadata,
  });
}

async function isAllowedSuperadminEmail(admin: AdminClient, email: string) {
  const { data, error } = await admin.rpc("vexonyx_is_superadmin_email", { p_email: email });
  return !error && data === true;
}

async function getSuperadminUserId(admin: AdminClient, email: string) {
  const { data, error } = await admin.rpc("vexonyx_superadmin_user_id", { p_email: email });
  if (error || typeof data !== "string" || !data) return null;
  return data;
}

async function ensureSuperadminProfile(admin: AdminClient, userId: string) {
  const { data, error } = await admin.schema("app").from("profiles").select("is_superadmin").eq("id", userId).maybeSingle();
  return !error && data?.is_superadmin === true;
}

async function passwordFailureLimited(admin: AdminClient, emailHash: string) {
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count } = await admin
    .schema("audit")
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "admin.password_login_failed")
    .contains("metadata", { email_hash: emailHash })
    .gte("created_at", cutoff);
  return (count ?? 0) >= MAX_PASSWORD_FAILURES;
}

async function createChallenge(admin: AdminClient, input: { purpose: ChallengePurpose; userId: string; email: string }) {
  const browserSecret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString();
  const { data, error } = await admin
    .schema("security")
    .from("admin_auth_challenges")
    .insert({
      purpose: input.purpose,
      user_id: input.userId,
      email_hash: sha256(input.email),
      browser_secret_hash: sha256(browserSecret),
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data?.id) throw error ?? new Error("Unable to create administrator authentication challenge");

  const store = await cookies();
  store.set(ADMIN_CHALLENGE_COOKIE, `${data.id}.${browserSecret}`, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: CHALLENGE_TTL_SECONDS,
  });

  return String(data.id);
}

async function clearChallengeCookie() {
  const store = await cookies();
  store.set(ADMIN_CHALLENGE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
}

async function readChallenge(admin: AdminClient, purpose: ChallengePurpose) {
  const store = await cookies();
  const raw = store.get(ADMIN_CHALLENGE_COOKIE)?.value ?? "";
  const separator = raw.indexOf(".");
  if (separator < 1) return null;

  const id = raw.slice(0, separator);
  const secret = raw.slice(separator + 1);
  if (!id || !secret) return null;

  const { data, error } = await admin
    .schema("security")
    .from("admin_auth_challenges")
    .select("id,purpose,user_id,email_hash,browser_secret_hash,attempts,expires_at,consumed_at")
    .eq("id", id)
    .eq("purpose", purpose)
    .maybeSingle();

  if (error || !data) return null;
  const challenge = data as ChallengeRow;
  if (challenge.consumed_at || new Date(challenge.expires_at).getTime() <= Date.now() || challenge.attempts >= MAX_OTP_ATTEMPTS) return null;

  const actual = Buffer.from(sha256(secret), "hex");
  const expected = Buffer.from(challenge.browser_secret_hash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return challenge;
}

async function failChallenge(admin: AdminClient, challenge: ChallengeRow, action: string) {
  const attempts = Math.min(MAX_OTP_ATTEMPTS, challenge.attempts + 1);
  await admin
    .schema("security")
    .from("admin_auth_challenges")
    .update({ attempts, consumed_at: attempts >= MAX_OTP_ATTEMPTS ? new Date().toISOString() : null })
    .eq("id", challenge.id)
    .is("consumed_at", null);
  await authAudit(admin, action, { user_id: challenge.user_id, attempts });
  if (attempts >= MAX_OTP_ATTEMPTS) await clearChallengeCookie();
}

async function consumeChallenge(admin: AdminClient, challengeId: string) {
  await admin.schema("security").from("admin_auth_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challengeId).is("consumed_at", null);
  await clearChallengeCookie();
}

async function generateAndSendCode(admin: AdminClient, input: { email: string; purpose: ChallengePurpose; userId: string }) {
  const linkType = input.purpose === "password_reset" ? "recovery" : "magiclink";
  const { data, error } = await admin.auth.admin.generateLink({ type: linkType, email: input.email });
  const code = data?.properties?.email_otp;
  if (error || !code) return false;

  const challengeId = await createChallenge(admin, input);
  const delivery = await createEmailProvider().sendAdminVerificationCode({ to: input.email, code, purpose: input.purpose });
  if (!delivery.sent) {
    await admin.schema("security").from("admin_auth_challenges").delete().eq("id", challengeId);
    await clearChallengeCookie();
    return false;
  }
  return true;
}

export async function startAdminPasswordLogin(formData: FormData) {
  const email = normalizeEmail(formData);
  const password = String(formData.get("password") ?? "");
  const emailHash = sha256(email);
  const admin = createAdminClient();
  if (!admin) redirect("/admin-login?error=configuration");

  const allowed = await isAllowedSuperadminEmail(admin, email);
  if (!allowed || !email || !password || await passwordFailureLimited(admin, emailHash)) {
    await authAudit(admin, "admin.password_login_failed", { email_hash: emailHash, reason: allowed ? "invalid_or_limited" : "unauthorized_identity" });
    redirect("/admin-login?error=invalid_credentials");
  }

  const verifier = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await verifier.auth.signInWithPassword({ email, password });
  if (error || !data.user?.id || !await ensureSuperadminProfile(admin, data.user.id)) {
    await authAudit(admin, "admin.password_login_failed", { email_hash: emailHash, reason: "invalid_credentials" });
    redirect("/admin-login?error=invalid_credentials");
  }

  const sent = await generateAndSendCode(admin, { email, purpose: "login", userId: data.user.id });
  await authAudit(admin, sent ? "admin.email_code_sent" : "admin.email_code_failed", { user_id: data.user.id, purpose: "login" });
  if (!sent) redirect("/admin-login?error=delivery");
  redirect("/admin-login?step=verify");
}

export async function verifyAdminLoginCode(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const admin = createAdminClient();
  if (!admin) redirect("/admin-login?error=configuration");
  const challenge = await readChallenge(admin, "login");
  if (!challenge || !/^\d{6}$/.test(code)) {
    await clearChallengeCookie();
    redirect("/admin-login?error=expired_challenge");
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(challenge.user_id);
  const email = userData.user?.email?.trim().toLowerCase();
  if (userError || !email || sha256(email) !== challenge.email_hash || !await isAllowedSuperadminEmail(admin, email)) {
    await failChallenge(admin, challenge, "admin.email_code_failed");
    redirect("/admin-login?step=verify&error=invalid_code");
  }

  const client = await createClient();
  const { data, error } = await client.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.session || data.user?.id !== challenge.user_id || !await ensureSuperadminProfile(admin, challenge.user_id)) {
    await failChallenge(admin, challenge, "admin.email_code_failed");
    redirect("/admin-login?step=verify&error=invalid_code");
  }

  await createVerifiedAdminSession(admin, challenge.user_id);
  await consumeChallenge(admin, challenge.id);
  await authAudit(admin, "admin.login_succeeded", { user_id: challenge.user_id, method: "password_plus_email_otp" });
  redirect("/admin");
}

export async function startAdminPasswordReset(formData: FormData) {
  const email = normalizeEmail(formData);
  const admin = createAdminClient();
  if (!admin) redirect("/admin-login?error=configuration");

  if (!email || !await isAllowedSuperadminEmail(admin, email)) {
    redirect("/admin-login?reset_sent=1");
  }

  const userId = await getSuperadminUserId(admin, email);
  if (!userId || !await ensureSuperadminProfile(admin, userId)) redirect("/admin-login?reset_sent=1");

  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count } = await admin
    .schema("security")
    .from("admin_auth_challenges")
    .select("id", { count: "exact", head: true })
    .eq("purpose", "password_reset")
    .eq("user_id", userId)
    .gte("created_at", cutoff);
  if ((count ?? 0) >= 3) redirect("/admin-login?reset_sent=1");

  const sent = await generateAndSendCode(admin, { email, purpose: "password_reset", userId });
  await authAudit(admin, sent ? "admin.password_reset_code_sent" : "admin.password_reset_code_failed", { user_id: userId });
  if (!sent) redirect("/admin-login?error=delivery");
  redirect("/admin-login?step=reset_verify");
}

export async function completeAdminPasswordReset(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const admin = createAdminClient();
  if (!admin) redirect("/admin-login?error=configuration");
  const challenge = await readChallenge(admin, "password_reset");
  if (!challenge) {
    await clearChallengeCookie();
    redirect("/admin-login?error=expired_challenge");
  }
  if (!/^\d{6}$/.test(code)) redirect("/admin-login?step=reset_verify&error=invalid_code");
  if (!validPassword(password) || password !== confirmPassword) redirect("/admin-login?step=reset_verify&error=password_rules");

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(challenge.user_id);
  const email = userData.user?.email?.trim().toLowerCase();
  if (userError || !email || sha256(email) !== challenge.email_hash || !await isAllowedSuperadminEmail(admin, email)) {
    await failChallenge(admin, challenge, "admin.password_reset_failed");
    redirect("/admin-login?step=reset_verify&error=invalid_code");
  }

  const client = await createClient();
  const { data, error } = await client.auth.verifyOtp({ email, token: code, type: "recovery" });
  if (error || !data.session || data.user?.id !== challenge.user_id || !await ensureSuperadminProfile(admin, challenge.user_id)) {
    await failChallenge(admin, challenge, "admin.password_reset_failed");
    redirect("/admin-login?step=reset_verify&error=invalid_code");
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(challenge.user_id, { password });
  if (updateError) {
    await failChallenge(admin, challenge, "admin.password_reset_failed");
    redirect("/admin-login?step=reset_verify&error=password_update");
  }

  await revokeAllVerifiedAdminSessions(admin, challenge.user_id);
  await consumeChallenge(admin, challenge.id);
  await authAudit(admin, "admin.password_reset_completed", { user_id: challenge.user_id, sessions_revoked: true });
  await client.auth.signOut({ scope: "global" });
  redirect("/admin-login?password=updated");
}
