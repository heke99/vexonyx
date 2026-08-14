import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_VERIFIED_COOKIE = "vx_admin_verified";
const VERIFIED_SESSION_TTL_SECONDS = 12 * 60 * 60;

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type VerifiedSessionRow = {
  id: string;
  user_id: string;
  browser_secret_hash: string;
  expires_at: string;
  revoked_at: string | null;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeHashEqual(actualValue: string, expectedHex: string) {
  const actual = Buffer.from(sha256(actualValue), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseCookie(raw: string) {
  const separator = raw.indexOf(".");
  if (separator < 1) return null;
  const id = raw.slice(0, separator);
  const secret = raw.slice(separator + 1);
  return id && secret ? { id, secret } : null;
}

async function clearCookie() {
  const store = await cookies();
  store.set(ADMIN_VERIFIED_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export async function createVerifiedAdminSession(admin: AdminClient, userId: string) {
  const browserSecret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + VERIFIED_SESSION_TTL_SECONDS * 1000).toISOString();

  await admin
    .schema("security")
    .from("admin_verified_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null)
    .lte("expires_at", new Date().toISOString());

  const { data, error } = await admin
    .schema("security")
    .from("admin_verified_sessions")
    .insert({
      user_id: userId,
      browser_secret_hash: sha256(browserSecret),
      method: "password_plus_email_otp",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data?.id) throw error ?? new Error("Unable to create verified Superadmin session");

  const store = await cookies();
  store.set(ADMIN_VERIFIED_COOKIE, `${data.id}.${browserSecret}`, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: VERIFIED_SESSION_TTL_SECONDS,
  });
}

export async function hasVerifiedAdminSession(admin: AdminClient, userId: string) {
  const store = await cookies();
  const parsed = parseCookie(store.get(ADMIN_VERIFIED_COOKIE)?.value ?? "");
  if (!parsed) return false;

  const { data, error } = await admin
    .schema("security")
    .from("admin_verified_sessions")
    .select("id,user_id,browser_secret_hash,expires_at,revoked_at")
    .eq("id", parsed.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return false;
  const session = data as VerifiedSessionRow;
  if (session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return false;
  return safeHashEqual(parsed.secret, session.browser_secret_hash);
}

export async function revokeCurrentVerifiedAdminSession(admin: AdminClient, userId: string) {
  const store = await cookies();
  const parsed = parseCookie(store.get(ADMIN_VERIFIED_COOKIE)?.value ?? "");
  if (parsed) {
    await admin
      .schema("security")
      .from("admin_verified_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", parsed.id)
      .eq("user_id", userId)
      .is("revoked_at", null);
  }
  await clearCookie();
}

export async function revokeAllVerifiedAdminSessions(admin: AdminClient, userId: string) {
  await admin
    .schema("security")
    .from("admin_verified_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  await clearCookie();
}
