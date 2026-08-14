import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const redirectTo = request.nextUrl.clone();
  redirectTo.search = "";

  if (!tokenHash) {
    redirectTo.pathname = "/admin-login";
    redirectTo.searchParams.set("error", "invalid_link");
    return NextResponse.redirect(redirectTo);
  }

  const client = await createClient();

  // Token-hash verification is intentionally browser-independent. The one-time
  // token carried by the email link is the credential; no PKCE verifier,
  // localStorage value, or cookie from the browser that requested the email is
  // required. Supabase verifies token hashes through the email OTP flow.
  const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error || !data.session || !data.user?.id) {
    redirectTo.pathname = "/admin-login";
    redirectTo.searchParams.set("error", "invalid_link");
    return NextResponse.redirect(redirectTo);
  }

  const { data: profile } = await client
    .schema("app")
    .from("profiles")
    .select("is_superadmin")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile?.is_superadmin) {
    await client.auth.signOut();
    redirectTo.pathname = "/admin-login";
    redirectTo.searchParams.set("error", "forbidden");
    return NextResponse.redirect(redirectTo);
  }

  redirectTo.pathname = "/admin";
  return NextResponse.redirect(redirectTo);
}
