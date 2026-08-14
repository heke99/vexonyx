import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = "/admin-login";
  redirectTo.search = "";
  redirectTo.searchParams.set("error", "legacy_link");
  return NextResponse.redirect(redirectTo);
}
