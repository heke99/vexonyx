import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeConfigured, stripeRequest } from "@/lib/billing/stripe";

const BILLING_ADMIN_ROLES = new Set(["organization_owner", "organization_admin"]);

export async function POST() {
  const ws = await getWorkspace();
  if (!ws?.organizationId || !ws.userId) return NextResponse.json({ error: "organization_required" }, { status: 401 });
  if (!ws.role || !BILLING_ADMIN_ROLES.has(ws.role)) return NextResponse.json({ error: "billing_admin_required" }, { status: 403 });
  if (!stripeConfigured()) return NextResponse.json({ error: "billing_not_enabled" }, { status: 503 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });

  const { data: subscription, error } = await admin.schema("billing").from("subscriptions")
    .select("provider_subscription_id,status,cancel_at_period_end,current_period_end")
    .eq("organization_id", ws.organizationId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "subscription_state_unavailable" }, { status: 503 });
  if (!subscription?.provider_subscription_id || !/^sub_[A-Za-z0-9]+$/.test(subscription.provider_subscription_id)) {
    return NextResponse.json({ error: "active_subscription_missing" }, { status: 404 });
  }
  if (subscription.status === "cancelled") return NextResponse.json({ error: "subscription_already_cancelled" }, { status: 409 });
  if (subscription.cancel_at_period_end) {
    return NextResponse.json({
      cancelled_at_period_end: true,
      current_period_end: subscription.current_period_end,
      duplicate: true,
    });
  }

  const params = new URLSearchParams({ cancel_at_period_end: "true" });
  try {
    const updated = await stripeRequest(
      `/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`,
      params,
      `cancel-at-period-end:${ws.organizationId}:${subscription.provider_subscription_id}`,
    );
    if (String(updated.id || "") !== subscription.provider_subscription_id || !Boolean(updated.cancel_at_period_end)) {
      return NextResponse.json({ error: "provider_cancellation_not_confirmed" }, { status: 502 });
    }

    const providerPeriodEnd = updated.current_period_end
      ? new Date(Number(updated.current_period_end) * 1000).toISOString()
      : subscription.current_period_end;
    const saved = await admin.schema("billing").from("subscriptions").update({
      cancel_at_period_end: true,
      current_period_end: providerPeriodEnd,
    }).eq("organization_id", ws.organizationId);
    if (saved.error) return NextResponse.json({ error: "cancellation_state_failed" }, { status: 500 });

    return NextResponse.json({ cancelled_at_period_end: true, current_period_end: providerPeriodEnd });
  } catch {
    return NextResponse.json({ error: "cancellation_failed" }, { status: 503 });
  }
}
