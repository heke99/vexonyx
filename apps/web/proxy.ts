import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_HOST = "admin.vexonyx.com";

function isAdminHost(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  return host === ADMIN_HOST || host === "admin.localhost";
}

async function customerSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data } = await supabase.auth.getClaims();
  return { response, claims: data?.claims ?? null };
}

export async function proxy(request: NextRequest) {
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

  if (path.startsWith("/admin") || path === "/admin-login" || path === "/admin-confirm" || path.startsWith("/preview")) {
    const url = new URL(`https://${ADMIN_HOST}${path}`);
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url);
  }

  if (path === "/signup") {
    const url = request.nextUrl.clone();
    url.pathname = "/waitlist";
    url.search = "";
    url.searchParams.set("from", "access");
    return NextResponse.redirect(url);
  }

  if (path.startsWith("/app") || path === "/login" || path.startsWith("/auth") || path.startsWith("/invite")) {
    const { response, claims } = await customerSession(request);
    if (path.startsWith("/app") && !claims?.sub) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/admin/:path*", "/admin-login", "/admin-confirm", "/preview/:path*", "/app/:path*", "/login", "/signup", "/auth/:path*", "/invite/:path*"],
};
