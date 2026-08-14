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
  const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error || !data.user?.id) {
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
