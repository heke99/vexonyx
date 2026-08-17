import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const asText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

function accepted() {
  return NextResponse.json({
    ok: true,
    status: "received",
    message: "If this address still needs verification, we'll email a link shortly. If it's already on the list, no action is required.",
  }, { status: 202, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = asText(input.email, 320).toLowerCase();
  if (!emailPattern.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  // Quietly absorb automated form fills. Real users never interact with this field.
  if (asText(input.website, 200)) return accepted();

  const audience = asText(input.signup_type, 20) === "company" ? "company" : "individual";
  const name = asText(input.name, 120) || null;
  const company = audience === "company" ? asText(input.company, 160) || null : null;
  const jobRole = asText(input.job_role, 120) || null;
  if (audience === "company" && !company) {
    return NextResponse.json({ error: "Enter your company or team name." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Unable to join right now." }, { status: 503 });

  const ipHash = hash(`waitlist-ip-v1:${clientIp(request)}`);
  const emailHash = hash(`waitlist-email-v1:${email}`);
  const limited = await admin.schema("launch").rpc("check_waitlist_rate_limit", {
    p_ip_hash: ipHash,
    p_email_hash: emailHash,
  });
  if (limited.error) return NextResponse.json({ error: "Unable to join right now." }, { status: 500 });
  const limitRow = Array.isArray(limited.data) ? limited.data[0] : limited.data;
  if (limitRow?.ip_limited) {
    const retryAfter = Math.max(1, Number(limitRow.retry_after_seconds ?? 60));
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, {
      status: 429,
      headers: { "retry-after": String(retryAfter), "cache-control": "no-store" },
    });
  }

  // Per-email throttling is intentionally indistinguishable from a normal submission.
  // This prevents an attacker from using response differences to enumerate waitlist membership.
  if (limitRow?.email_limited) return accepted();

  const idempotencyKey = request.headers.get("idempotency-key")?.slice(0, 160) ?? crypto.randomUUID();
  const joined = await admin.schema("launch").rpc("join_waitlist", {
    p_email: email,
    p_name: name,
    p_company: company,
    p_job_role: jobRole,
    p_country: asText(input.country, 80) || null,
    p_source: `website:${audience}`,
    p_referral_code: asText(input.ref, 40) || null,
    p_idempotency_key: idempotencyKey,
  });
  if (joined.error) return NextResponse.json({ error: "Unable to join right now." }, { status: 500 });

  const row = Array.isArray(joined.data) ? joined.data[0] : joined.data;
  const entryId = row?.entry_id as string | undefined;
  const entryStatus = String(row?.status ?? "pending_verification");
  if (!entryId) return NextResponse.json({ error: "Unable to join right now." }, { status: 500 });

  if (entryStatus === "pending_verification") {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hash(token);
    const verifyUrl = new URL("/api/v1/waitlist/verify", request.url);
    verifyUrl.searchParams.set("entry", entryId);
    verifyUrl.searchParams.set("token", token);

    const prepared = await admin.schema("launch").rpc("prepare_waitlist_verification_email", {
      p_entry_id: entryId,
      p_token_hash: tokenHash,
      p_verification_url: verifyUrl.toString(),
    });
    if (prepared.error) return NextResponse.json({ error: "Unable to join right now." }, { status: 500 });
  }

  // Never reveal whether the address was new, already verified, invited, converted, or blocked.
  return accepted();
}
