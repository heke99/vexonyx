import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const asText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const email = asText(input.email, 320).toLowerCase();
  if (!emailPattern.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const idempotencyKey = request.headers.get("idempotency-key")?.slice(0, 160) ?? crypto.randomUUID();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.schema("launch").rpc("join_waitlist", {
    p_email: email,
    p_name: asText(input.name, 120) || null,
    p_company: asText(input.company, 160) || null,
    p_job_role: asText(input.job_role, 120) || null,
    p_country: asText(input.country, 80) || null,
    p_source: asText(input.source, 80) || "website",
    p_referral_code: asText(input.ref, 40) || null,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    const status = error.message.includes("rate_limited") ? 429 : 500;
    return NextResponse.json({ error: status === 429 ? "Too many attempts. Try again shortly." : "Unable to join right now." }, { status });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, referralCode: row?.referral_code ?? null, status: row?.status ?? "pending_verification" }, { status: 201 });
}
