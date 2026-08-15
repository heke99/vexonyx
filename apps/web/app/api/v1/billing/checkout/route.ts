import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeRequest } from "@/lib/billing/stripe";

function origin() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://vexonyx.com";
}

export async function POST(request: Request) {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return NextResponse.json({ error: "organization_required" }, { status: 401 });
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
  if (kind === "subscription") {
    if (!body?.price_id) return NextResponse.json({ error: "price_required" }, { status: 400 });
    const { data: price } = await admin.schema("billing").from("plan_prices").select("id,provider_price_id,active,plan_id").eq("id", body.price_id).eq("active", true).maybeSingle();
    if (!price?.provider_price_id) return NextResponse.json({ error: "price_not_available" }, { status: 409 });
    providerPriceId = price.provider_price_id;
    catalogId = price.plan_id;
  } else {
    if (!body?.credit_product_id) return NextResponse.json({ error: "credit_product_required" }, { status: 400 });
    const { data: product } = await admin.schema("billing").from("credit_products").select("id,provider_price_id,active,credits").eq("id", body.credit_product_id).eq("active", true).maybeSingle();
    if (!product?.provider_price_id) return NextResponse.json({ error: "credit_product_not_available" }, { status: 409 });
    providerPriceId = product.provider_price_id;
    catalogId = product.id;
    credits = Number(product.credits);
  }

  let { data: customer } = await admin.schema("billing").from("billing_customers").select("provider_customer_id").eq("organization_id", ws.organizationId).maybeSingle();
  if (!customer) {
    const customerParams = new URLSearchParams();
    if (email) customerParams.set("email", email);
    customerParams.set("metadata[organization_id]", ws.organizationId);
    const created = await stripeRequest("/customers", customerParams, `customer:${ws.organizationId}`);
    const customerId = String(created.id || "");
    if (!customerId) return NextResponse.json({ error: "customer_creation_failed" }, { status: 502 });
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
  params.set("metadata[organization_id]", ws.organizationId);
  params.set("metadata[user_id]", ws.userId);
  params.set("metadata[kind]", kind);
  params.set("metadata[catalog_id]", catalogId || "");
  if (kind === "credit_pack") params.set("metadata[credits]", String(credits));
  if (kind === "subscription") params.set("subscription_data[metadata][organization_id]", ws.organizationId);

  try {
    const session = await stripeRequest("/checkout/sessions", params, `checkout:${ws.organizationId}:${kind}:${catalogId}:${Date.now()}`);
    const url = typeof session.url === "string" ? session.url : null;
    if (!url) return NextResponse.json({ error: "checkout_session_failed" }, { status: 502 });
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "stripe_not_configured" ? "billing_not_enabled" : "checkout_failed" }, { status: 503 });
  }
}
