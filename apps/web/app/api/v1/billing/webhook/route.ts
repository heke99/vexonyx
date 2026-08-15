import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeRequest, verifyStripeSignature } from "@/lib/billing/stripe";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function POST(request: Request) {
  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"))) return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  const event = JSON.parse(payload) as Record<string, unknown>;
  const eventId = String(event.id || "");
  const eventType = String(event.type || "");
  const object = asRecord(asRecord(event.data).object);
  if (!eventId || !eventType) return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "server_unavailable" }, { status: 503 });

  const existing = await admin.schema("billing").from("events").select("id").eq("external_id", eventId).maybeSingle();
  if (existing.data) return NextResponse.json({ received: true, duplicate: true });
  const eventInsert = await admin.schema("billing").from("events").insert({ event_type: eventType, external_id: eventId, organization_id: object.metadata && typeof object.metadata === "object" ? String((object.metadata as Record<string, unknown>).organization_id || "") || null : null, payload: event, occurred_at: new Date(Number(event.created || Math.floor(Date.now()/1000))*1000).toISOString() });
  if (eventInsert.error && eventInsert.error.code !== "23505") return NextResponse.json({ error: "event_store_failed" }, { status: 500 });

  try {
    if (eventType === "checkout.session.completed") {
      const metadata = asRecord(object.metadata);
      const organizationId = String(metadata.organization_id || object.client_reference_id || "");
      const userId = String(metadata.user_id || "") || null;
      const kind = String(metadata.kind || "");
      if (!organizationId) throw new Error("missing_organization");
      const currency = String(object.currency || "USD").toUpperCase();
      const amount = Number(object.amount_total || 0);
      await admin.schema("billing").from("payment_transactions").upsert({ organization_id: organizationId, user_id: userId, provider: "stripe", provider_transaction_id: String(object.payment_intent || object.id), kind: kind === "credit_pack" ? "credit_pack" : "subscription", status: "succeeded", amount_minor: amount, currency, credits: Number(metadata.credits || 0), metadata: { checkout_session_id: object.id, event_id: eventId } }, { onConflict: "provider,provider_transaction_id" });
      if (kind === "credit_pack") {
        const credits = Number(metadata.credits || 0);
        if (!Number.isSafeInteger(credits) || credits <= 0) throw new Error("invalid_credits");
        const applied = await admin.schema("billing").rpc("apply_credit_entry", { p_organization_id: organizationId, p_user_id: userId, p_entry_type: "purchase", p_amount: credits, p_idempotency_key: `stripe:${eventId}`, p_external_reference: String(object.payment_intent || object.id), p_metadata: { checkout_session_id: object.id } });
        if (applied.error) throw applied.error;
      }
      if (kind === "subscription" && object.subscription) {
        const subscription = await stripeRequest(`/subscriptions/${encodeURIComponent(String(object.subscription))}`);
        const planPrice = asRecord((Array.isArray(asRecord(asRecord(subscription.items).data)) ? (asRecord(subscription.items).data as unknown[])[0] : null));
        const priceId = String(asRecord(planPrice.price).id || "");
        const { data: localPrice } = await admin.schema("billing").from("plan_prices").select("plan_id").eq("provider", "stripe").eq("provider_price_id", priceId).maybeSingle();
        await admin.schema("billing").from("subscriptions").upsert({ organization_id: organizationId, plan_id: localPrice?.plan_id || null, status: String(subscription.status || "active"), provider: "stripe", provider_subscription_id: String(subscription.id), current_period_start: subscription.current_period_start ? new Date(Number(subscription.current_period_start)*1000).toISOString() : null, current_period_end: subscription.current_period_end ? new Date(Number(subscription.current_period_end)*1000).toISOString() : null, cancel_at_period_end: Boolean(subscription.cancel_at_period_end), metadata: { latest_event_id: eventId } }, { onConflict: "organization_id" });
      }
    }

    if (eventType.startsWith("customer.subscription.")) {
      const metadata = asRecord(object.metadata);
      const organizationId = String(metadata.organization_id || "");
      if (organizationId) {
        const status = eventType === "customer.subscription.deleted" ? "cancelled" : String(object.status || "active");
        const firstItem = Array.isArray(asRecord(object.items).data) ? (asRecord(object.items).data as unknown[])[0] : null;
        const providerPriceId = String(asRecord(asRecord(firstItem).price).id || "");
        const { data: localPrice } = providerPriceId ? await admin.schema("billing").from("plan_prices").select("plan_id").eq("provider", "stripe").eq("provider_price_id", providerPriceId).maybeSingle() : { data: null };
        const { data: previous } = await admin.schema("billing").from("subscriptions").select("id,status,plan_id").eq("organization_id", organizationId).maybeSingle();
        const upserted = await admin.schema("billing").from("subscriptions").upsert({ organization_id: organizationId, plan_id: localPrice?.plan_id || previous?.plan_id || null, status, provider: "stripe", provider_subscription_id: String(object.id), current_period_start: object.current_period_start ? new Date(Number(object.current_period_start)*1000).toISOString() : null, current_period_end: object.current_period_end ? new Date(Number(object.current_period_end)*1000).toISOString() : null, cancel_at_period_end: Boolean(object.cancel_at_period_end), cancelled_at: object.canceled_at ? new Date(Number(object.canceled_at)*1000).toISOString() : null, metadata: { latest_event_id: eventId } }, { onConflict: "organization_id" }).select("id,plan_id").single();
        if (!upserted.error) await admin.schema("billing").from("subscription_history").insert({ organization_id: organizationId, subscription_id: upserted.data.id, plan_id: upserted.data.plan_id, event_type: eventType, previous_status: previous?.status || null, new_status: status, provider_event_id: eventId });
      }
    }

    if (eventType === "invoice.payment_failed" || eventType === "invoice.paid") {
      const customerId = String(object.customer || "");
      const { data: customer } = customerId ? await admin.schema("billing").from("billing_customers").select("organization_id").eq("provider", "stripe").eq("provider_customer_id", customerId).maybeSingle() : { data: null };
      if (customer?.organization_id) {
        const status = eventType === "invoice.paid" ? "succeeded" : "failed";
        await admin.schema("billing").from("payment_transactions").upsert({ organization_id: customer.organization_id, provider: "stripe", provider_transaction_id: String(object.id), kind: "invoice", status, amount_minor: Number(object.amount_paid || object.amount_due || 0), currency: String(object.currency || "USD").toUpperCase(), metadata: { event_id: eventId, hosted_invoice_url: object.hosted_invoice_url || null } }, { onConflict: "provider,provider_transaction_id" });
        if (eventType === "invoice.payment_failed") await admin.schema("billing").from("subscriptions").update({ status: "past_due" }).eq("organization_id", customer.organization_id);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("billing_webhook_processing_failed", { eventId, eventType, error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
