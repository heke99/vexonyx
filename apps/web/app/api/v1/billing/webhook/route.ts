import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeRequest, verifyStripeSignature } from "@/lib/billing/stripe";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function numeric(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
}

function normalizeStatus(value: unknown, deleted = false) {
  if (deleted) return "cancelled";
  const v = String(value || "active");
  if (v === "trialing") return "trialing";
  if (v === "active") return "active";
  if (v === "paused") return "paused";
  if (v === "canceled" || v === "cancelled") return "cancelled";
  return "past_due";
}

function taxAmount(object: Record<string, unknown>) {
  const details = asRecord(object.total_details);
  if (details.amount_tax !== undefined) return numeric(details.amount_tax);
  const modern = asRecords(object.total_taxes).reduce((sum, item) => sum + numeric(item.amount), 0);
  if (modern) return modern;
  return asRecords(object.total_tax_amounts).reduce((sum, item) => sum + numeric(item.amount), 0);
}

function taxSnapshot(object: Record<string, unknown>) {
  const customerDetails = asRecord(object.customer_details);
  const customerAddress = asRecord(customerDetails.address);
  const invoiceAddress = asRecord(object.customer_address);
  const address = Object.keys(customerAddress).length ? customerAddress : invoiceAddress;
  const subtotal = numeric(object.amount_subtotal ?? object.subtotal ?? object.amount_total ?? object.total ?? object.amount_paid ?? object.amount_due);
  const total = numeric(object.amount_total ?? object.total ?? object.amount_paid ?? object.amount_due, subtotal);
  const tax = taxAmount(object);
  const automaticTax = asRecord(object.automatic_tax);
  const autoEnabled = Boolean(automaticTax.enabled);
  const status = String(automaticTax.status || "") || (autoEnabled ? (tax > 0 ? "calculated_tax" : "calculated_zero") : "not_calculated");
  return {
    subtotal,
    total,
    tax,
    status,
    autoEnabled,
    country: String(address.country || "") || null,
    state: String(address.state || "") || null,
    postalCode: String(address.postal_code || "") || null,
    address,
    customerDetails,
    automaticTax,
    totalDetails: asRecord(object.total_details),
  };
}

function invoiceSubscriptionId(object: Record<string, unknown>) {
  const parent = asRecord(object.parent);
  if (String(parent.type || "") !== "subscription_details") return null;
  const details = asRecord(parent.subscription_details);
  const subscriptionId = String(details.subscription || "");
  return /^sub_[A-Za-z0-9]+$/.test(subscriptionId) ? subscriptionId : null;
}

function isMonthlyGrantInvoice(object: Record<string, unknown>) {
  const billingReason = String(object.billing_reason || "");
  return billingReason === "subscription_create" || billingReason === "subscription_cycle";
}

async function syncBillingCustomer(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  organizationId: string,
  object: Record<string, unknown>,
) {
  const details = asRecord(object.customer_details);
  const invoiceAddress = asRecord(object.customer_address);
  const address = Object.keys(asRecord(details.address)).length ? asRecord(details.address) : invoiceAddress;
  const taxIds = Array.isArray(details.tax_ids) ? details.tax_ids : Array.isArray(object.customer_tax_ids) ? object.customer_tax_ids : [];
  const customerId = String(object.customer || "");
  const patch = {
    billing_name: String(details.name || object.customer_name || "") || null,
    billing_email: String(details.email || object.customer_email || "") || null,
    billing_address: address,
    tax_country: String(address.country || "") || null,
    tax_ids: taxIds,
    tax_exempt: String(details.tax_exempt || object.customer_tax_exempt || "") || null,
    tax_location_source: Object.keys(address).length ? "stripe_customer" : "unknown",
    tax_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (customerId) {
    const result = await admin.schema("billing").from("billing_customers").update(patch)
      .eq("organization_id", organizationId)
      .eq("provider", "stripe")
      .eq("provider_customer_id", customerId);
    if (result.error) throw result.error;
  }
}

async function syncEntitlements(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  organizationId: string,
  planId: string | null,
) {
  const result = await admin.schema("billing").rpc("sync_plan_entitlements", {
    p_organization_id: organizationId,
    p_plan_id: planId,
  });
  if (result.error) throw result.error;
}

async function loadStripeSubscriptionPlan(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  providerSubscriptionId: string,
) {
  const subscription = await stripeRequest(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}`);
  const items = asRecord(subscription.items).data;
  const first = Array.isArray(items) ? asRecord(items[0]) : {};
  const priceId = String(asRecord(first.price).id || "");
  if (!priceId) throw new Error("subscription_price_missing");
  const local = await admin.schema("billing").from("plan_prices").select("plan_id")
    .eq("provider", "stripe")
    .eq("provider_price_id", priceId)
    .maybeSingle();
  if (local.error) throw local.error;
  const planId = local.data?.plan_id || null;
  if (!planId) throw new Error("subscription_price_unmapped");
  return { subscription, planId };
}

function subscriptionTax(subscription: Record<string, unknown>) {
  const automaticTax = asRecord(subscription.automatic_tax);
  return {
    automatic_tax_enabled: Boolean(automaticTax.enabled),
    tax_details: { automatic_tax: automaticTax },
  };
}

async function resolvePaidInvoicePlan(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  organizationId: string,
  customerId: string,
  invoice: Record<string, unknown>,
) {
  if (!isMonthlyGrantInvoice(invoice)) return null;
  const providerSubscriptionId = invoiceSubscriptionId(invoice);
  if (!providerSubscriptionId) return null;

  const local = await admin.schema("billing").from("subscriptions")
    .select("plan_id,provider_subscription_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (local.error) throw local.error;

  if (local.data?.provider_subscription_id && local.data.provider_subscription_id !== providerSubscriptionId) {
    throw new Error("invoice_subscription_mismatch");
  }

  const resolved = await loadStripeSubscriptionPlan(admin, providerSubscriptionId);
  const subscriptionMetadata = asRecord(resolved.subscription.metadata);
  const stripeOrganizationId = String(subscriptionMetadata.organization_id || "");
  if (!stripeOrganizationId || stripeOrganizationId !== organizationId) {
    throw new Error("invoice_subscription_org_mismatch");
  }
  if (String(resolved.subscription.customer || "") !== customerId) {
    throw new Error("invoice_subscription_customer_mismatch");
  }
  if (local.data?.plan_id && local.data.plan_id !== resolved.planId) {
    throw new Error("invoice_subscription_plan_mismatch");
  }

  return { planId: local.data?.plan_id || resolved.planId, providerSubscriptionId };
}

export async function POST(request: Request) {
  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }

  const eventId = String(event.id || "");
  const eventType = String(event.type || "");
  const object = asRecord(asRecord(event.data).object);
  if (!eventId || !eventType) return NextResponse.json({ error: "invalid_event" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "server_unavailable" }, { status: 503 });

  const existing = await admin.schema("billing").from("events").select("id,processed_at")
    .eq("external_id", eventId)
    .maybeSingle();
  if (existing.data?.processed_at) return NextResponse.json({ received: true, duplicate: true });

  if (!existing.data) {
    const metadata = asRecord(object.metadata);
    const stored = await admin.schema("billing").from("events").insert({
      event_type: eventType,
      external_id: eventId,
      organization_id: String(metadata.organization_id || "") || null,
      payload: event,
      occurred_at: new Date(Number(event.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    });
    if (stored.error && stored.error.code !== "23505") {
      return NextResponse.json({ error: "event_store_failed" }, { status: 500 });
    }
  }

  try {
    if (eventType === "checkout.session.completed") {
      const metadata = asRecord(object.metadata);
      const organizationId = String(metadata.organization_id || object.client_reference_id || "");
      const userId = String(metadata.user_id || "") || null;
      const kind = String(metadata.kind || "");
      if (!organizationId) throw new Error("missing_organization");

      await admin.schema("billing").from("events").update({ organization_id: organizationId }).eq("external_id", eventId);
      const tax = taxSnapshot(object);
      await syncBillingCustomer(admin, organizationId, object);
      let purchasedCredits = 0;

      if (kind === "credit_pack") {
        const catalogId = String(metadata.catalog_id || "");
        if (!catalogId) throw new Error("missing_catalog_id");
        const catalog = await admin.schema("billing").from("credit_products")
          .select("id,credits,currency,unit_amount_minor,active,provider_sync_status")
          .eq("id", catalogId)
          .eq("active", true)
          .eq("provider_sync_status", "synced")
          .maybeSingle();
        if (catalog.error) throw catalog.error;
        if (!catalog.data) throw new Error("credit_product_unavailable");
        purchasedCredits = Number(catalog.data.credits);
        if (!Number.isSafeInteger(purchasedCredits) || purchasedCredits <= 0) throw new Error("invalid_catalog_credits");
        const expectedAmount = Number(catalog.data.unit_amount_minor);
        if (tax.subtotal !== expectedAmount) throw new Error("credit_product_amount_mismatch");
        if (String(object.currency || "").toUpperCase() !== String(catalog.data.currency || "").toUpperCase()) {
          throw new Error("credit_product_currency_mismatch");
        }
      }

      const tx = await admin.schema("billing").from("payment_transactions").upsert({
        organization_id: organizationId,
        user_id: userId,
        provider: "stripe",
        provider_transaction_id: String(object.payment_intent || object.id),
        kind: kind === "credit_pack" ? "credit_pack" : "subscription",
        status: "succeeded",
        amount_minor: tax.total,
        currency: String(object.currency || "USD").toUpperCase(),
        credits: purchasedCredits,
        subtotal_minor: tax.subtotal,
        tax_minor: tax.tax,
        total_minor: tax.total,
        tax_status: tax.status,
        tax_country: tax.country,
        tax_state: tax.state,
        tax_postal_code: tax.postalCode,
        tax_details: {
          automatic_tax: tax.automaticTax,
          total_details: tax.totalDetails,
          checkout_session_id: object.id,
        },
        metadata: {
          checkout_session_id: object.id,
          event_id: eventId,
          catalog_id: String(metadata.catalog_id || "") || null,
          automatic_tax_enabled: tax.autoEnabled,
        },
      }, { onConflict: "provider,provider_transaction_id" });
      if (tx.error) throw tx.error;

      if (kind === "credit_pack") {
        const applied = await admin.schema("billing").rpc("apply_credit_entry", {
          p_organization_id: organizationId,
          p_user_id: userId,
          p_entry_type: "purchase",
          p_amount: purchasedCredits,
          p_idempotency_key: `stripe:${eventId}`,
          p_external_reference: String(object.payment_intent || object.id),
          p_metadata: { checkout_session_id: object.id, catalog_id: String(metadata.catalog_id || "") },
        });
        if (applied.error) throw applied.error;
      }

      if (kind === "subscription" && object.subscription) {
        const { subscription, planId } = await loadStripeSubscriptionPlan(admin, String(object.subscription));
        const taxState = subscriptionTax(subscription);
        const saved = await admin.schema("billing").from("subscriptions").upsert({
          organization_id: organizationId,
          plan_id: planId,
          status: normalizeStatus(subscription.status),
          provider: "stripe",
          provider_subscription_id: String(subscription.id),
          current_period_start: subscription.current_period_start ? new Date(Number(subscription.current_period_start) * 1000).toISOString() : null,
          current_period_end: subscription.current_period_end ? new Date(Number(subscription.current_period_end) * 1000).toISOString() : null,
          cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
          automatic_tax_enabled: taxState.automatic_tax_enabled,
          tax_details: taxState.tax_details,
          metadata: { latest_event_id: eventId },
        }, { onConflict: "organization_id" });
        if (saved.error) throw saved.error;
        await syncEntitlements(admin, organizationId, planId);
      }
    }

    if (eventType.startsWith("customer.subscription.")) {
      const metadata = asRecord(object.metadata);
      const organizationId = String(metadata.organization_id || "");
      if (organizationId) {
        const items = asRecord(object.items).data;
        const first = Array.isArray(items) ? asRecord(items[0]) : {};
        const providerPriceId = String(asRecord(first.price).id || "");
        const local = providerPriceId
          ? await admin.schema("billing").from("plan_prices").select("plan_id").eq("provider", "stripe").eq("provider_price_id", providerPriceId).maybeSingle()
          : { data: null };
        const previous = await admin.schema("billing").from("subscriptions").select("id,status,plan_id").eq("organization_id", organizationId).maybeSingle();
        const planId = local.data?.plan_id || previous.data?.plan_id || null;
        const status = normalizeStatus(object.status, eventType === "customer.subscription.deleted");
        const taxState = subscriptionTax(object);
        const upserted = await admin.schema("billing").from("subscriptions").upsert({
          organization_id: organizationId,
          plan_id: planId,
          status,
          provider: "stripe",
          provider_subscription_id: String(object.id),
          current_period_start: object.current_period_start ? new Date(Number(object.current_period_start) * 1000).toISOString() : null,
          current_period_end: object.current_period_end ? new Date(Number(object.current_period_end) * 1000).toISOString() : null,
          cancel_at_period_end: Boolean(object.cancel_at_period_end),
          cancelled_at: object.canceled_at ? new Date(Number(object.canceled_at) * 1000).toISOString() : null,
          automatic_tax_enabled: taxState.automatic_tax_enabled,
          tax_details: taxState.tax_details,
          metadata: { latest_event_id: eventId },
        }, { onConflict: "organization_id" }).select("id,plan_id").single();
        if (upserted.error) throw upserted.error;
        await syncEntitlements(admin, organizationId, planId);
        const hist = await admin.schema("billing").from("subscription_history").insert({
          organization_id: organizationId,
          subscription_id: upserted.data.id,
          plan_id: upserted.data.plan_id,
          event_type: eventType,
          previous_status: previous.data?.status || null,
          new_status: status,
          provider_event_id: eventId,
        });
        if (hist.error && hist.error.code !== "23505") throw hist.error;
      }
    }

    if (eventType === "invoice.payment_failed" || eventType === "invoice.paid") {
      const customerId = String(object.customer || "");
      const customer = customerId
        ? await admin.schema("billing").from("billing_customers").select("organization_id")
          .eq("provider", "stripe")
          .eq("provider_customer_id", customerId)
          .maybeSingle()
        : { data: null };

      if (customer.data?.organization_id) {
        const organizationId = customer.data.organization_id;
        await syncBillingCustomer(admin, organizationId, object);
        const status = eventType === "invoice.paid" ? "succeeded" : "failed";
        const tax = taxSnapshot(object);
        const tx = await admin.schema("billing").from("payment_transactions").upsert({
          organization_id: organizationId,
          provider: "stripe",
          provider_transaction_id: String(object.id),
          kind: "invoice",
          status,
          amount_minor: tax.total,
          currency: String(object.currency || "USD").toUpperCase(),
          subtotal_minor: tax.subtotal,
          tax_minor: tax.tax,
          total_minor: tax.total,
          tax_status: tax.status,
          tax_country: tax.country,
          tax_state: tax.state,
          tax_postal_code: tax.postalCode,
          tax_details: {
            automatic_tax: tax.automaticTax,
            total_details: tax.totalDetails,
            hosted_invoice_url: object.hosted_invoice_url || null,
          },
          metadata: {
            event_id: eventId,
            hosted_invoice_url: object.hosted_invoice_url || null,
            billing_reason: String(object.billing_reason || "") || null,
            provider_subscription_id: invoiceSubscriptionId(object),
          },
        }, { onConflict: "provider,provider_transaction_id" });
        if (tx.error) throw tx.error;

        const providerSubscriptionId = invoiceSubscriptionId(object);
        if (eventType === "invoice.payment_failed") {
          if (providerSubscriptionId) {
            const result = await admin.schema("billing").from("subscriptions").update({ status: "past_due" })
              .eq("organization_id", organizationId)
              .eq("provider", "stripe")
              .eq("provider_subscription_id", providerSubscriptionId);
            if (result.error) throw result.error;
          }
        } else {
          const resolved = await resolvePaidInvoicePlan(admin, organizationId, customerId, object);
          if (resolved?.planId) {
            const ent = await admin.schema("billing").from("plan_entitlements").select("entitlement_value")
              .eq("plan_id", resolved.planId)
              .eq("entitlement_key", "credits.monthly")
              .maybeSingle();
            if (ent.error) throw ent.error;
            const value = Number(ent.data?.entitlement_value ?? 0);
            if (Number.isSafeInteger(value) && value > 0) {
              const grant = await admin.schema("billing").rpc("apply_credit_entry", {
                p_organization_id: organizationId,
                p_user_id: null,
                p_entry_type: "plan_grant",
                p_amount: value,
                p_idempotency_key: `invoice-credit:${object.id}`,
                p_external_reference: String(object.id),
                p_metadata: {
                  event_id: eventId,
                  plan_id: resolved.planId,
                  provider_subscription_id: resolved.providerSubscriptionId,
                  billing_reason: String(object.billing_reason || ""),
                },
              });
              if (grant.error) throw grant.error;
            }
          }
        }
      }
    }

    const done = await admin.schema("billing").from("events").update({
      processed_at: new Date().toISOString(),
      processing_error: null,
    }).eq("external_id", eventId);
    if (done.error) throw done.error;
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("billing_webhook_processing_failed", { eventId, eventType, error: message });
    await admin.schema("billing").from("events").update({ processing_error: message.slice(0, 500) }).eq("external_id", eventId);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
