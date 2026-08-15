import { getWorkspace } from "@/lib/workspace";
import { CheckoutButton, BillingPortalButton, CancelSubscriptionButton } from "@/components/billing-actions";

function money(minor: unknown, currency: unknown) {
  const amount = Number(minor ?? 0) / 100;
  const code = String(currency || "USD");
  return new Intl.NumberFormat("en", { style: "currency", currency: code }).format(amount);
}

function humanize(value: unknown) {
  if (typeof value === "boolean") return value ? "Included" : "Not included";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function label(key: string) {
  return key.replaceAll(".", " ").replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export default async function BillingPage() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;
  const [subscription, plans, credits, account, transactions, entitlements, creditRates] = await Promise.all([
    ws.supabase.schema("billing").from("subscriptions").select("status,current_period_end,cancel_at_period_end,plan_id,automatic_tax_enabled,plans(id,name,code)").eq("organization_id", ws.organizationId).maybeSingle(),
    ws.supabase.schema("billing").from("plan_prices").select("id,billing_interval,currency,unit_amount_minor,active,provider_sync_status,tax_behavior,plans!inner(id,name,code,description,is_public,status,display_order,provider_sync_status)").eq("active", true).eq("provider_sync_status", "synced").eq("plans.is_public", true).eq("plans.status", "active").eq("plans.provider_sync_status", "synced").order("unit_amount_minor"),
    ws.supabase.schema("billing").from("credit_products").select("id,code,name,description,credits,currency,unit_amount_minor,provider_sync_status,tax_behavior").eq("active", true).eq("provider_sync_status", "synced").order("display_order"),
    ws.supabase.schema("billing").from("credit_accounts").select("balance,lifetime_purchased,lifetime_granted,lifetime_consumed").eq("organization_id", ws.organizationId).maybeSingle(),
    ws.supabase.schema("billing").from("payment_transactions").select("id,kind,status,amount_minor,subtotal_minor,tax_minor,total_minor,tax_status,tax_country,currency,credits,created_at").eq("organization_id", ws.organizationId).order("created_at", { ascending: false }).limit(20),
    ws.supabase.schema("billing").from("plan_entitlements").select("plan_id,entitlement_key,entitlement_value").order("entitlement_key"),
    ws.supabase.schema("billing").from("credit_rates").select("id,metric,unit,credits_per_unit").eq("active", true).order("metric"),
  ]);

  const sub = subscription.data as Record<string, unknown> | null;
  const currentPlan = sub?.plans && typeof sub.plans === "object" ? sub.plans as Record<string, unknown> : null;
  const currentPlanId = typeof sub?.plan_id === "string" ? sub.plan_id : null;
  const allEntitlements = entitlements.data ?? [];
  const currentAllowances = allEntitlements.filter((item) => item.plan_id === currentPlanId);
  const credit = account.data;
  const canManageBilling = ws.role === "organization_owner" || ws.role === "organization_admin";
  const periodEnd = typeof sub?.current_period_end === "string" ? sub.current_period_end : null;
  const cancellationScheduled = Boolean(sub?.cancel_at_period_end);

  return <div className="app-content">
    <div className="app-heading"><div><h1>Plan & credits</h1><p>Your plan, credits, limits and usage rates come from the same server-side catalog that Superadmin controls. Prices are shown before applicable sales tax, VAT or GST. Where VEXONYX is registered to collect tax, Stripe calculates it from your checkout location and tax details. Purchases require explicit acceptance of the Terms, Acceptable Use Policy and Refund & Cancellation Policy.</p></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}>{canManageBilling && currentPlan && !cancellationScheduled ? <CancelSubscriptionButton periodEnd={periodEnd} /> : null}{canManageBilling ? <BillingPortalButton /> : null}</div></div>
    <section className="metric-grid">
      <div className="metric"><span>Current plan</span><strong style={{ fontSize: 22 }}>{String(currentPlan?.name || "No paid plan")}</strong></div>
      <div className="metric"><span>Subscription</span><strong style={{ fontSize: 22 }}>{cancellationScheduled ? "cancels at period end" : String(sub?.status || "inactive")}</strong></div>
      <div className="metric"><span>Credits available</span><strong>{Number(credit?.balance ?? 0).toLocaleString()}</strong></div>
      <div className="metric"><span>Credits used</span><strong>{Number(credit?.lifetime_consumed ?? 0).toLocaleString()}</strong></div>
    </section>

    <section className="workspace-card"><header><h2>Subscriptions</h2><span>{periodEnd ? `${cancellationScheduled ? "Ends" : "Renews"} ${new Date(periodEnd).toLocaleDateString("en-GB")}` : "Provider-backed checkout"}</span></header>
      {plans.error ? <div className="empty-state"><b>Plan catalog is unavailable.</b></div> : plans.data?.length ? plans.data.map((price) => {
        const plan = price.plans as unknown as Record<string, unknown>;
        const isCurrent = String(plan.id) === currentPlanId;
        const monthlyCredits = Number(allEntitlements.find((item) => item.plan_id === String(plan.id) && item.entitlement_key === "credits.monthly")?.entitlement_value ?? 0);
        return <div className="project-row" key={price.id}><div><b>{String(plan.name)}{isCurrent ? " · Current" : ""}</b><small>{String(plan.description || "VEXONYX subscription")} · {monthlyCredits.toLocaleString()} credits / month · automatically renews monthly until cancelled · plus applicable tax</small></div><div style={{ display: "flex", alignItems: "center", gap: 14 }}><strong>{money(price.unit_amount_minor, price.currency)} / month</strong>{isCurrent ? <span style={{ fontSize: 11, color: "#8b929c" }}>{cancellationScheduled ? "Renewal stopped" : "Active"}</span> : <CheckoutButton kind="subscription" id={price.id}>Choose plan</CheckoutButton>}</div></div>;
      }) : <div className="empty-state"><div><b>No subscription plans are on sale yet.</b><p>Plans only appear after Superadmin has synchronized the Stripe Product and Price and explicitly published the plan.</p></div></div>}
    </section>

    <section className="workspace-card"><header><h2>Your plan includes</h2><span>{currentPlan ? String(currentPlan.name) : "No active paid plan"}</span></header>
      {currentAllowances.length ? currentAllowances.map((item) => <div className="project-row" key={item.entitlement_key}><div><b>{label(item.entitlement_key)}</b><small>{item.entitlement_key}</small></div><strong>{humanize(item.entitlement_value)}</strong></div>) : <div className="empty-state"><div><b>No plan allowances are published for this account.</b><p>Limits remain fail-closed until Superadmin defines them in the plan catalog.</p></div></div>}
    </section>

    <section className="workspace-card"><header><h2>Credit packs</h2><span>One-time purchases · non-refundable except where required by law</span></header>
      {credits.data?.length ? credits.data.map((item) => <div className="project-row" key={item.id}><div><b>{item.name}</b><small>{Number(item.credits).toLocaleString()} credits · {item.description || "Additional usage credits"} · no cash redemption value · plus applicable tax</small></div><div style={{ display: "flex", alignItems: "center", gap: 14 }}><strong>{money(item.unit_amount_minor, item.currency)}</strong><CheckoutButton kind="credit_pack" id={item.id}>Buy credits</CheckoutButton></div></div>) : <div className="empty-state"><div><b>No credit packs are active.</b><p>Credit packs appear only after Stripe Product + Price synchronization and explicit activation.</p></div></div>}
    </section>

    <section className="workspace-card"><header><h2>Billing terms</h2><span>Policy version 2026-08-15</span></header>
      <div className="project-row"><div><b>Subscriptions</b><small>Automatic monthly renewal until cancelled online. Cancellation stops the next renewal and normally leaves the current paid period active. No prorated refund for unused time except where mandatory law requires otherwise.</small></div></div>
      <div className="project-row"><div><b>Credit packs</b><small>One-time service-usage credits. They are not money, stored value or cash-equivalent and are non-refundable except for mandatory rights, duplicate charges or verified billing errors.</small></div></div>
      <div className="project-row"><div><b>Policies</b><small><a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a> · <a href="/refunds" target="_blank" rel="noopener noreferrer">Refund & Cancellation</a> · <a href="/acceptable-use" target="_blank" rel="noopener noreferrer">Acceptable Use</a> · <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a></small></div></div>
    </section>

    <section className="workspace-card"><header><h2>How credits are used</h2><span>Active usage rates</span></header>
      {creditRates.data?.length ? creditRates.data.map((rate) => <div className="project-row" key={rate.id}><div><b>{label(rate.metric)}</b><small>Per {String(rate.unit).replaceAll("_", " ")}</small></div><strong>{Number(rate.credits_per_unit).toLocaleString()} credits</strong></div>) : <div className="empty-state"><div><b>No usage rates are published yet.</b><p>Credit deductions remain disabled until an active rate exists.</p></div></div>}
    </section>

    <section className="workspace-card"><header><h2>Payment history</h2><span>Latest 20</span></header>{transactions.data?.length ? transactions.data.map((tx) => <div className="project-row" key={tx.id}><div><b>{String(tx.kind).replaceAll("_", " ")}</b><small>{tx.status} · {new Date(tx.created_at).toLocaleString("en-GB")}{Number(tx.credits) > 0 ? ` · ${Number(tx.credits).toLocaleString()} credits` : ""}{tx.tax_country ? ` · ${tx.tax_country}` : ""}</small><small>{Number(tx.tax_minor ?? 0) > 0 ? `Subtotal ${money(tx.subtotal_minor, tx.currency)} · Tax ${money(tx.tax_minor, tx.currency)}` : `Tax status: ${String(tx.tax_status || "not calculated").replaceAll("_", " ")}`}</small></div><span>{money(tx.total_minor ?? tx.amount_minor, tx.currency)}</span></div>) : <div className="empty-state"><div><b>No purchases yet.</b><p>Successful provider webhooks will appear here.</p></div></div>}</section>
  </div>;
}
