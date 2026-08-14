import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/waitlist";
  url.search = "";
  const from = request.nextUrl.pathname.startsWith("/app") ? "workspace" : "access";
  url.searchParams.set("from", from);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*", "/login", "/signup", "/auth/:path*", "/invite/:path*"],
};
