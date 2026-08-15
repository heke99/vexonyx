import { stripeConfigured } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabaseConfig = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const commerceConfig = stripeConfigured();
  let taxInfrastructureConfig = false;
  let taxCollectionConfig = false;

  const admin = createAdminClient();
  if (admin) {
    const { data } = await admin.schema("billing").from("tax_settings")
      .select("automatic_collection_enabled,active_registration_count")
      .eq("provider", "stripe")
      .maybeSingle();
    taxInfrastructureConfig = Boolean(data);
    taxCollectionConfig = Boolean(data?.automatic_collection_enabled && Number(data.active_registration_count) > 0);
  }

  return Response.json(
    {
      status: supabaseConfig ? "ready" : "degraded",
      dependencies: {
        supabaseConfig,
        commerceConfig,
        taxInfrastructureConfig,
        taxCollectionConfig,
      },
    },
    {
      status: supabaseConfig ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
