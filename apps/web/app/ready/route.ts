import { stripeConfigured } from "@/lib/billing/stripe";

export function GET() {
  const supabaseConfig = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const commerceConfig = stripeConfigured();
  return Response.json(
    {
      status: supabaseConfig ? "ready" : "degraded",
      dependencies: {
        supabaseConfig,
        commerceConfig,
      },
    },
    {
      status: supabaseConfig ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
