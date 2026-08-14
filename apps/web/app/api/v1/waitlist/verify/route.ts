import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const entry = url.searchParams.get("entry") ?? "";
  const token = url.searchParams.get("token") ?? "";
  const destination = new URL("/waitlist/verified", request.url);

  if (!uuidPattern.test(entry) || token.length < 32 || token.length > 128) {
    destination.searchParams.set("status","invalid");
    return NextResponse.redirect(destination,303);
  }

  const admin = createAdminClient();
  if (!admin) {
    destination.searchParams.set("status","unavailable");
    return NextResponse.redirect(destination,303);
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await admin.schema("launch").rpc("verify_waitlist", { p_entry_id:entry, p_token_hash:tokenHash });
  if (error) {
    destination.searchParams.set("status","invalid");
    return NextResponse.redirect(destination,303);
  }

  const row = Array.isArray(data) ? data[0] : data;
  destination.searchParams.set("status","verified");
  if (row?.referral_code) destination.searchParams.set("ref",String(row.referral_code));
  return NextResponse.redirect(destination,303);
}
