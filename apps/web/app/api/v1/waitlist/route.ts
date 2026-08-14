import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEmailProvider } from "@/lib/email/provider";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const asText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = asText(input.email, 320).toLowerCase();
  if (!emailPattern.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const audience = asText(input.signup_type, 20) === "company" ? "company" : "individual";
  const name = asText(input.name, 120) || null;
  const company = audience === "company" ? asText(input.company, 160) || null : null;
  const jobRole = asText(input.job_role, 120) || null;
  if (audience === "company" && !company) {
    return NextResponse.json({ error: "Enter your company or team name." }, { status: 400 });
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.slice(0, 160) ?? crypto.randomUUID();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.schema("launch").rpc("join_waitlist", {
    p_email: email,
    p_name: name,
    p_company: company,
    p_job_role: jobRole,
    p_country: asText(input.country, 80) || null,
    p_source: `website:${audience}`,
    p_referral_code: asText(input.ref, 40) || null,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    const status = error.message.includes("rate_limited") ? 429 : 500;
    return NextResponse.json({ error: status === 429 ? "Too many attempts. Try again shortly." : "Unable to join right now." }, { status });
  }

  const row = Array.isArray(data) ? data[0] : data;
  const entryId = row?.entry_id as string | undefined;
  const entryStatus = String(row?.status ?? "pending_verification");
  if (!entryId) return NextResponse.json({ error: "Unable to join right now." }, { status: 500 });

  if (["verified", "invited", "converted"].includes(entryStatus)) {
    return NextResponse.json({ ok: true, status: entryStatus, verified: true, referralCode: row?.referral_code ?? null }, { status: 200 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: true, status: "pending_verification", verified: false, verificationDelivery: "not_configured" }, { status: 202 });
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  await admin.schema("launch").from("waitlist_verification_tokens").update({ consumed_at: now }).eq("entry_id", entryId).is("consumed_at", null);
  const { error: tokenError } = await admin.schema("launch").from("waitlist_verification_tokens").insert({ entry_id: entryId, token_hash: tokenHash, expires_at: expiresAt });
  if (tokenError) return NextResponse.json({ error: "Unable to prepare email verification." }, { status: 500 });

  const verifyUrl = new URL("/api/v1/waitlist/verify", request.url);
  verifyUrl.searchParams.set("entry", entryId);
  verifyUrl.searchParams.set("token", token);
  const delivery = await createEmailProvider().sendWaitlistVerification({ to: email, verificationUrl: verifyUrl.toString(), name });

  return NextResponse.json({
    ok: true,
    status: "pending_verification",
    verified: false,
    verificationDelivery: delivery.sent ? "sent" : delivery.reason,
  }, { status: delivery.sent ? 201 : 202 });
}
