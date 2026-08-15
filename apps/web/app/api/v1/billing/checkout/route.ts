import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { listActiveStripeTaxRegistrations, stripeConfigured, stripeRequest } from "@/lib/billing/stripe";

function origin() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://vexonyx.com";
}

export async function POST(request: Request) {
  const ws = await getWorkspace();
  if (!ws?.organizationId || !ws.userId) return NextResponse.json({ error: "organization_required" }, { status: 401 });
  if (!stripeConfigured()) return NextResponse.json({ error: "billing_not_enabled" }, { status: 503 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });

  const body = await request.json().catch(() => null) as { kind?: string; price_id?: string; credit_product_id?: string } | null;
  const kind = body?.kind;
  if (kind !== "subscription" && kind !== "credit_pack") return NextResponse.json({ error: "invalid_checkout_kind" }, { status: 400 });

  const { data: claims } = await ws.supabase.auth.getClaims();
  const email = typeof claims?.claims?.email === "string" ? claims.claims.email : null;

  let providerPriceId: string | null = null;
  let credits = 0;
  let catalogId: string | null = null;
  let taxCode: string | null = null;
  let taxClassificationStatus: string | null = null;

  if (kind === "subscription") {
    if (!body?.price_id) return NextResponse.json({ error: "price_required" }, { status: 400 });
    const { data: price } = await admin.schema("billing").from("plan_prices")
      .select("id,provider_price_id,provider_sync_status,active,plan_id,tax_behavior,plans!inner(status,is_public,provider_sync_status,provider_product_id,tax_code,tax_classification_status)")
      .eq("id", body.price_id)
      .eq("active", true)
      .eq("provider_sync_status", "synced")
      .eq("plans.status", "active")
      .eq("plans.is_public", true)
      .eq("plans.provider_sync_status", "synced")
      .maybeSingle();
    if (!price?.provider_price_id) return NextResponse.json({ error: "price_not_available" }, { status: 409 });
    providerPriceId = price.provider_price_id;
    catalogId = price.plan_id;
    const plan = price.plans as unknown as { tax_code?: string | null; tax_classification_status?: string | null };
    taxCode = plan.tax_code || null;
    taxClassificationStatus = plan.tax_classification_status || null;
  } else {
    if (!body?.credit_product_id) return NextResponse.json({ error: "credit_product_required" }, { status: 400 });
    const { data: product } = await admin.schema("billing").from("credit_products")
      .select("id,provider_product_id,provider_price_id,provider_sync_status,active,credits,tax_code,tax_classification_status,tax_behavior")
      .eq("id", body.credit_product_id)
      .eq("active", true)
      .eq("provider_sync_status", "synced")
      .maybeSingle();
    if (!product?.provider_product_id || !product.provider_price_id) return NextResponse.json({ error: "credit_product_not_available" }, { status: 409 });
    providerPriceId = product.provider_price_id;
    catalogId = product.id;
    credits = Number(product.credits);
    taxCode = product.tax_code || null;
    taxClassificationStatus = product.tax_classification_status || null;
  }
  if (!providerPriceId) return NextResponse.json({ error: "price_not_available" }, { status: 409 });

  const { data: taxSettings, error: taxSettingsError } = await admin.schema("billing").from("tax_settings")
    .select("automatic_collection_enabled,active_registration_count")
    .eq("provider", "stripe")
    .maybeSingle();
  if (taxSettingsError) return NextResponse.json({ error: "tax_state_unavailable" }, { status: 503 });

  let automaticTaxEnabled = Boolean(taxSettings?.automatic_collection_enabled);
  if (automaticTaxEnabled) {
    if (!taxCode || taxClassificationStatus !== "confirmed") {
      return NextResponse.json({ error: "tax_classification_not_confirmed" }, { status: 409 });
    }
    const registrations = await listActiveStripeTaxRegistrations();
    if (!registrations.length) {
      await admin.schema("billing").from("tax_settings").update({
        automatic_collection_enabled: false,
        active_registration_count: 0,
        last_registration_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("provider", "stripe");
      automaticTaxEnabled = false;
      return NextResponse.json({ error: "tax_registration_missing" }, { status: 409 });
    }
    if (registrations.length !== Number(taxSettings?.active_registration_count ?? 0)) {
      await admin.schema("billing").from("tax_settings").update({
        active_registration_count: registrations.length,
        last_registration_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("provider", "stripe");
    }
  }

  let { data: customer } = await admin.schema("billing").from("billing_customers").select("provider_customer_id").eq("organization_id", ws.organizationId).maybeSingle();
  if (!customer) {
    const customerParams = new URLSearchParams();
    if (email) customerParams.set("email", email);
    customerParams.set("metadata[organization_id]", ws.organizationId);
    const created = await stripeRequest("/customers", customerParams, `customer:${ws.organizationId}`);
    const customerId = String(created.id || "");
    if (!/^cus_[A-Za-z0-9]+$/.test(customerId)) return NextResponse.json({ error: "customer_creation_failed" }, { status: 502 });
    const inserted = await admin.schema("billing").from("billing_customers").upsert({ organization_id: ws.organizationId, provider: "stripe", provider_customer_id: customerId, billing_email: email }, { onConflict: "organization_id" }).select("provider_customer_id").single();
    if (inserted.error) return NextResponse.json({ error: "customer_state_failed" }, { status: 500 });
    customer = inserted.data;
  }

  const params = new URLSearchParams();
  params.set("customer", customer.provider_customer_id);
  params.set("mode", kind === "subscription" ? "subscription" : "payment");
  params.set("line_items[0][price]", providerPriceId);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${origin()}/app/billing?checkout=success`);
  params.set("cancel_url", `${origin()}/app/billing?checkout=cancelled`);
  params.set("client_reference_id", ws.organizationId);
  params.set("integration_identifier", "vexonyx_tax_kqmvzjht");
  params.set("tax_id_collection[enabled]", "true");
  params.set("customer_update[address]", "auto");
  params.set("customer_update[name]", "auto");
  if (automaticTaxEnabled) params.set("automatic_tax[enabled]", "true");
  params.set("metadata[organization_id]", ws.organizationId);
  params.set("metadata[user_id]", ws.userId);
  params.set("metadata[kind]", kind);
  params.set("metadata[catalog_id]", catalogId || "");
  params.set("metadata[automatic_tax_enabled]", String(automaticTaxEnabled));
  params.set("metadata[tax_code]", taxCode || "");
  if (kind === "credit_pack") params.set("metadata[credits]", String(credits));
  if (kind === "subscription") {
    params.set("subscription_data[metadata][organization_id]", ws.organizationId);
    params.set("subscription_data[metadata][automatic_tax_enabled]", String(automaticTaxEnabled));
    params.set("subscription_data[metadata][tax_code]", taxCode || "");
  }

  try {
    const session = await stripeRequest("/checkout/sessions", params, `checkout:${ws.organizationId}:${kind}:${catalogId}:${Date.now()}`);
    const url = typeof session.url === "string" ? session.url : null;
    if (!url) return NextResponse.json({ error: "checkout_session_failed" }, { status: 502 });
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "checkout_failed" }, { status: 503 });
  }
}
