export function GET() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return Response.json({ status: configured ? "ready" : "degraded", dependencies: { supabaseConfig: configured } }, { status: configured ? 200 : 503, headers: { "cache-control": "no-store" } });
}
