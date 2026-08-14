import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { safeLocalPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const code = request.nextUrl.searchParams.get("code");
  const next = safeLocalPath(request.nextUrl.searchParams.get("next"), "/app");
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next.split("?")[0] || "/app";
  redirectTo.search = next.includes("?") ? `?${next.split("?").slice(1).join("?")}` : "";
  redirectTo.hash = "";
  const supabase = await createClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(redirectTo);
  }
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(redirectTo);
  }
  redirectTo.pathname = "/login";
  redirectTo.search = "";
  redirectTo.searchParams.set("error", "confirmation");
  if (next !== "/app") redirectTo.searchParams.set("next", next);
  return NextResponse.redirect(redirectTo);
}
