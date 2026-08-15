import { requireSuperadmin } from "@/lib/admin/guard";
import { stripeSecretConfigured, stripeWebhookConfigured } from "@/lib/billing/stripe";
import {
  publishPlan,
  retirePlan,
  retryPlanPriceProviderSync,
  retryPlanProviderSync,
  savePlan,
  savePlanEntitlement,
  savePlanPrice,
  setPlanPriceActive,
} from "../commerce-actions";

function money(minor: unknown, currency: unknown) {
  return new Intl.NumberFormat("en", { style: "currency", currency: String(currency || "USD") }).format(Number(minor || 0) / 100);
}
function shortProviderId(value: unknown) {
  const id = String(value || "");
  if (!id) return "—";
  return id.length > 28 ? `${id.slice(0, 16)}…${id.slice(-8)}` : id;
}
function statusLabel(value: unknown) {
  return String(value || "unknown").replaceAll("_", " ");
}

export default async function AdminBillingPage() {
  const { admin } = await requireSuperadmin();
  const [plans, prices, entitlements, subs, transactions] = await Promise.all([
    admin.schema("billing").from("plans").select("id,code,name,description,status,is_public,display_order,provider,provider_product_id,provider_sync_status,provider_sync_error,provider_synced_at,updated_at").order("display_order").order("name"),
    admin.schema("billing").from("plan_prices").select("id,plan_id,billing_interval,currency,unit_amount_minor,provider,provider_price_id,provider_sync_status,provider_sync_error,provider_synced_at,active,effective_from,effective_to").order("effective_from", { ascending: false }),
    admin.schema("billing").from("plan_entitlements").select("plan_id,entitlement_key,entitlement_value,updated_at").order("entitlement_key"),
    admin.schema("billing").from("subscriptions").select("id,organization_id,plan_id,status,current_period_end,cancel_at_period_end,provider_subscription_id,app_organizations:organization_id(name)").order("updated_at", { ascending: false }).limit(100),
    admin.schema("billing").from("payment_transactions").select("id,organization_id,kind,status,amount_minor,currency,credits,provider_transaction_id,created_at").order("created_at", { ascending: false }).limit(100),
  ]);

  const planRows = plans.data ?? [];
  const priceRows = prices.data ?? [];
  const entitlementRows = entitlements.data ?? [];
  const stripeApiReady = stripeSecretConfigured();
  const stripeWebhookReady = stripeWebhookConfigured();
  const syncedPlans = planRows.filter((plan) => plan.provider_sync_status === "synced" && plan.provider_product_id).length;
  const checkoutReadyPrices = priceRows.filter((price) => price.active && price.provider_sync_status === "synced" && price.provider_price_id).length;
  const publicPlans = planRows.filter((plan) => plan.status === "active" && plan.is_public).length;

  return <div className="admin-page">
    <div className="admin-heading"><div className="admin-heading-copy"><div className="admin-eyebrow">VEXONYX / COMMERCE</div><h1>Plans & billing</h1><p>VEXONYX owns plan rules and entitlements. Stripe owns payment products, immutable prices, subscriptions, invoices and payments. A plan is never customer-visible until both sides are synchronized.</p></div></div>

    <section className="admin-grid equal">
      <article className="admin-card"><div className="admin-card-header"><h2>Catalog state</h2><span>Single source of truth</span></div><div className="admin-card-body admin-health">
        <div className="admin-health-row"><span>Plans</span><b>{planRows.length}</b></div>
        <div className="admin-health-row"><span>Stripe-synced plans</span><b>{syncedPlans}</b></div>
        <div className="admin-health-row"><span>Checkout-ready prices</span><b>{checkoutReadyPrices}</b></div>
        <div className="admin-health-row"><span>Published plans</span><b>{publicPlans}</b></div>
      </div></article>
      <article className="admin-card"><div className="admin-card-header"><h2>Stripe readiness</h2><span>Production provider</span></div><div className="admin-card-body admin-health">
        <div className="admin-health-row"><span>Stripe API secret</span><b>{stripeApiReady ? "Configured" : "Missing"}</b></div>
        <div className="admin-health-row"><span>Webhook signing secret</span><b>{stripeWebhookReady ? "Configured" : "Missing"}</b></div>
        <div className="admin-health-row"><span>Manual price IDs</span><b>Disabled</b></div>
        <div className="admin-health-row"><span>Checkout policy</span><b>{stripeApiReady && stripeWebhookReady ? "Fail-closed ready" : "Blocked"}</b></div>
      </div></article>
    </section>

    <section className="admin-grid equal">
      <article className="admin-card"><div className="admin-card-header"><h2>Create plan</h2><span>Auto-sync Product</span></div><form className="admin-card-body admin-form" action={savePlan}>
        <input className="admin-input" name="code" placeholder="pro" required/>
        <input className="admin-input" name="name" placeholder="VEXONYX Pro" required/>
        <textarea className="admin-input" name="description" placeholder="Plan description"/>
        <small>New plans start as private drafts. VEXONYX immediately creates the matching Stripe Product and records the provider ID. Publishing stays locked until at least one synced active price exists.</small>
        <button className="admin-button primary" type="submit">Create draft & sync Stripe</button>
      </form></article>
      <article className="admin-card"><div className="admin-card-header"><h2>Add price</h2><span>Auto-sync Price</span></div><form className="admin-card-body admin-form" action={savePlanPrice}>
        <select className="admin-input" name="plan_id" required><option value="">Choose Stripe-synced plan</option>{planRows.filter((plan) => plan.provider_sync_status === "synced" && plan.provider_product_id && plan.status !== "retired").map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>
        <select className="admin-input" name="billing_interval" defaultValue="month"><option value="month">Monthly</option><option value="year">Yearly</option></select>
        <input className="admin-input" name="currency" defaultValue="USD" maxLength={3}/>
        <input className="admin-input" name="unit_amount_minor" type="number" min="0" placeholder="9900" required/>
        <label><input type="checkbox" name="active" value="true"/> Activate for checkout after Stripe sync</label>
        <small>No <code>price_...</code> is entered manually. Stripe creates it from this server-side action. Changing amount or interval means creating a new price.</small>
        <button className="admin-button" type="submit">Create Stripe price</button>
      </form></article>
    </section>

    <section className="admin-grid equal">
      <article className="admin-card"><div className="admin-card-header"><h2>Entitlement</h2><span>VEXONYX-owned limits</span></div><form className="admin-card-body admin-form" action={savePlanEntitlement}>
        <select className="admin-input" name="plan_id" required><option value="">Choose plan</option>{planRows.filter((plan) => plan.status !== "retired").map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>
        <input className="admin-input" name="entitlement_key" placeholder="agent.max_runs_monthly" required/>
        <input className="admin-input" name="entitlement_value" placeholder="100 or true or {&quot;soft&quot;:80,&quot;hard&quot;:100}" required/>
        <button className="admin-button" type="submit">Save entitlement</button>
      </form></article>
      <article className="admin-card"><div className="admin-card-header"><h2>Catalog safety</h2><span>Enforced server + DB</span></div><div className="admin-card-body admin-health">
        <div className="admin-health-row"><span>Client controls amount</span><b>No</b></div>
        <div className="admin-health-row"><span>Product / Price IDs</span><b>Automatic</b></div>
        <div className="admin-health-row"><span>Public unsynced plan</span><b>DB blocked</b></div>
        <div className="admin-health-row"><span>Last live price removal</span><b>DB blocked</b></div>
        <div className="admin-health-row"><span>Webhook idempotency</span><b>Required</b></div>
      </div></article>
    </section>

    <section className="admin-card"><div className="admin-card-header"><h2>Plan catalog</h2><span>{planRows.length}</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Plan</th><th>Catalog state</th><th>Stripe sync</th><th>Checkout readiness</th><th>Entitlements</th><th>Actions</th></tr></thead><tbody>
      {planRows.map((plan) => {
        const planPrices = priceRows.filter((price) => price.plan_id === plan.id);
        const ready = planPrices.filter((price) => price.active && price.provider_sync_status === "synced" && price.provider_price_id);
        const planEntitlements = entitlementRows.filter((item) => item.plan_id === plan.id);
        const subscriberCount = (subs.data ?? []).filter((sub) => sub.plan_id === plan.id && ["trialing", "active", "past_due"].includes(sub.status)).length;
        return <tr key={plan.id}>
          <td><b>{plan.name}</b><small>{plan.code} · {subscriberCount} subscriber{subscriberCount === 1 ? "" : "s"}</small>{plan.description ? <small>{plan.description}</small> : null}</td>
          <td><b>{statusLabel(plan.status)}</b><small>{plan.is_public ? "Published to customers" : "Private"}</small></td>
          <td><b>{statusLabel(plan.provider_sync_status)}</b><small>{shortProviderId(plan.provider_product_id)}</small>{plan.provider_sync_error ? <small>Last error: {plan.provider_sync_error}</small> : null}</td>
          <td>{planPrices.length ? planPrices.map((price) => <div key={price.id} style={{marginBottom:10}}><b>{money(price.unit_amount_minor, price.currency)} / {price.billing_interval}</b><small>{price.active ? "Checkout ready" : "Not for checkout"} · Stripe {statusLabel(price.provider_sync_status)}</small><small>{shortProviderId(price.provider_price_id)}</small>{price.provider_sync_error ? <small>Last error: {price.provider_sync_error}</small> : null}<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>{price.provider_sync_status !== "synced" ? <form action={retryPlanPriceProviderSync}><input type="hidden" name="price_id" value={price.id}/><button className="admin-button" type="submit">Retry price sync</button></form> : <form action={setPlanPriceActive}><input type="hidden" name="price_id" value={price.id}/><input type="hidden" name="active" value={price.active ? "false" : "true"}/><button className="admin-button" type="submit">{price.active ? "Deactivate" : "Activate"}</button></form>}</div></div>) : <small>No prices yet</small>}</td>
          <td>{planEntitlements.length ? planEntitlements.map((item) => <small key={item.entitlement_key}>{item.entitlement_key}: {JSON.stringify(item.entitlement_value)}</small>) : <small>No entitlements configured</small>}</td>
          <td><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {plan.provider_sync_status !== "synced" || !plan.provider_product_id ? <form action={retryPlanProviderSync}><input type="hidden" name="plan_id" value={plan.id}/><button className="admin-button" type="submit">Retry Stripe sync</button></form> : null}
            {plan.status === "draft" && ready.length > 0 && plan.provider_sync_status === "synced" ? <form action={publishPlan}><input type="hidden" name="plan_id" value={plan.id}/><button className="admin-button primary" type="submit">Publish</button></form> : null}
            {plan.status !== "retired" ? <form action={retirePlan}><input type="hidden" name="plan_id" value={plan.id}/><button className="admin-button" type="submit">Retire</button></form> : null}
          </div></td>
        </tr>;
      })}
    </tbody></table></div></section>

    <section className="admin-card"><div className="admin-card-header"><h2>Subscriptions</h2><span>{subs.data?.length ?? 0}</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Organization</th><th>Plan</th><th>Status</th><th>Period end</th><th>Stripe subscription</th></tr></thead><tbody>{(subs.data ?? []).map((sub) => <tr key={sub.id}><td>{sub.organization_id}</td><td>{planRows.find((plan) => plan.id === sub.plan_id)?.name || "—"}</td><td>{sub.status}</td><td>{sub.current_period_end ? new Date(sub.current_period_end).toLocaleString("en-GB") : "—"}</td><td><small>{shortProviderId(sub.provider_subscription_id)}</small></td></tr>)}</tbody></table></div></section>

    <section className="admin-card"><div className="admin-card-header"><h2>Recent transactions</h2><span>{transactions.data?.length ?? 0}</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Organization</th><th>Type</th><th>Status</th><th>Amount</th><th>Credits</th><th>Time</th></tr></thead><tbody>{(transactions.data ?? []).map((tx) => <tr key={tx.id}><td>{tx.organization_id}</td><td>{tx.kind}</td><td>{tx.status}</td><td>{money(tx.amount_minor, tx.currency)}</td><td>{Number(tx.credits).toLocaleString()}</td><td>{new Date(tx.created_at).toLocaleString("en-GB")}</td></tr>)}</tbody></table></div></section>
  </div>;
}
