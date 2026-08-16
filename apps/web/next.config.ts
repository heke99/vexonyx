import type { NextConfig } from "next";

const supabaseHost = "https://*.supabase.co";
const securityHeaders = [
  { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' ${supabaseHost} wss://*.supabase.co; upgrade-insecure-requests` },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

if (process.env.VERCEL_ENV === "production") {
  const required = [
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "RESEND_API_KEY",
  ] as const;
  const missing: string[] = required.filter((name) => !process.env[name]);
  if (!process.env.WAITLIST_FROM_EMAIL && !process.env.TRANSACTIONAL_FROM_EMAIL) {
    missing.push("WAITLIST_FROM_EMAIL or TRANSACTIONAL_FROM_EMAIL");
  }
  if (missing.length) {
    throw new Error(`VEXONYX production configuration is incomplete. Missing: ${missing.join(", ")}`);
  }
}

const waitlistRedirects = ["/login", "/signup", "/sign-up", "/register", "/create-account"];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.vexonyx.com" }],
        destination: "https://vexonyx.com/:path*",
        permanent: true,
      },
      ...waitlistRedirects.map((source) => ({ source, destination: "/waitlist", permanent: false })),
      { source: "/invite/:path*", destination: "/waitlist", permanent: false },
      { source: "/auth/:path*", destination: "/waitlist", permanent: false },
    ];
  },
};

export default nextConfig;
