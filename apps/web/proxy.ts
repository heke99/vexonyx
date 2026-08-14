import { NextResponse, type NextRequest } from "next/server";

const ADMIN_HOST = "admin.vexonyx.com";

function isAdminHost(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  return host === ADMIN_HOST || host === "admin.localhost";
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const adminHost = isAdminHost(request);

  if (adminHost) {
    if (path === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }

    if (path.startsWith("/app") || path === "/login" || path === "/signup" || path.startsWith("/invite")) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      url.search = "";
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  if (path.startsWith("/admin") || path === "/admin-login" || path === "/admin-confirm") {
    const url = new URL(`https://${ADMIN_HOST}${path}`);
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url);
  }

  if (path.startsWith("/app") || path === "/login" || path === "/signup" || path.startsWith("/auth") || path.startsWith("/invite")) {
    const url = request.nextUrl.clone();
    url.pathname = "/waitlist";
    url.search = "";
    url.searchParams.set("from", path.startsWith("/app") ? "workspace" : "access");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/admin/:path*", "/admin-login", "/admin-confirm", "/app/:path*", "/login", "/signup", "/auth/:path*", "/invite/:path*"],
};
