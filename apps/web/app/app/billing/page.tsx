import { getWorkspace } from "@/lib/workspace";
import { CheckoutButton, BillingPortalButton } from "@/components/billing-actions";

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
    ws.supabase.schema("billing").from("subscriptions").select("status,current_period_end,cancel_at_period_end,plan_id,plans(name,code)").eq("organization_id",ws.organizationId).maybeSingle(),
    ws.supabase.schema("billing").from("plan_prices").select("id,billing_interval,currency,unit_amount_minor,active,plans!inner(id,name,code,description,is_public,status,display_order)").eq("active",true).eq("plans.is_public",true).eq("plans.status","active").order("unit_amount_minor"),
    ws.supabase.schema("billing").from("credit_products").select("id,code,name,description,credits,currency,unit_amount_minor").eq("active",true).order("display_order"),
    ws.supabase.schema("billing").from("credit_accounts").select("balance,lifetime_purchased,lifetime_granted,lifetime_consumed").eq("organization_id",ws.organizationId).maybeSingle(),
    ws.supabase.schema("billing").from("payment_transactions").select("id,kind,status,amount_minor,currency,credits,created_at").eq("organization_id",ws.organizationId).order("created_at",{ascending:false}).limit(20),
    ws.supabase.schema("billing").from("plan_entitlements").select("plan_id,entitlement_key,entitlement_value").order("entitlement_key"),
    ws.supabase.schema("billing").from("credit_rates").select("id,metric,unit,credits_per_unit").eq("active",true).order("metric"),
  ]);

  const sub = subscription.data as Record<string,unknown> | null;
  const currentPlan = sub?.plans && typeof sub.plans === "object" ? sub.plans as Record<string,unknown> : null;
  const currentPlanId = typeof sub?.plan_id === "string" ? sub.plan_id : null;
  const currentAllowances = (entitlements.data ?? []).filter((item) => item.plan_id === currentPlanId);
  const credit = account.data;

  return <div className="app-content">
    <div className="app-heading"><div><h1>Plan & credits</h1><p>Your plan, credits, usage rates and payment history come from the same server-side catalog that controls checkout. Payment state is never inferred from the browser.</p></div><BillingPortalButton /></div>
    <section className="metric-grid">
      <div className="metric"><span>Current plan</span><strong style={{fontSize:22}}>{String(currentPlan?.name || "No paid plan")}</strong></div>
      <div className="metric"><span>Subscription</span><strong style={{fontSize:22}}>{String(sub?.status || "inactive")}</strong></div>
      <div className="metric"><span>Credits available</span><strong>{Number(credit?.balance ?? 0).toLocaleString()}</strong></div>
      <div className="metric"><span>Credits used</span><strong>{Number(credit?.lifetime_consumed ?? 0).toLocaleString()}</strong></div>
    </section>

    <section className="workspace-card"><header><h2>Subscriptions</h2><span>{sub?.current_period_end ? `Renews / ends ${new Date(String(sub.current_period_end)).toLocaleDateString("en-GB")}` : "Manage from one place"}</span></header>
      {plans.error ? <div className="empty-state"><b>Plan catalog is unavailable.</b></div> : plans.data?.length ? plans.data.map((price)=>{const plan=price.plans as unknown as Record<string,unknown>;const isCurrent=String(plan.id)===currentPlanId;return <div className="project-row" key={price.id}><div><b>{String(plan.name)}{isCurrent?" · Current":""}</b><small>{String(plan.description || "VEXONYX subscription")} · {price.billing_interval}</small></div><div style={{display:"flex",alignItems:"center",gap:14}}><strong>{money(price.unit_amount_minor,price.currency)}</strong>{isCurrent?<BillingPortalButton />:<CheckoutButton kind="subscription" id={price.id}>Choose plan</CheckoutButton>}</div></div>}) : <div className="empty-state"><div><b>No subscription plans are on sale yet.</b><p>The catalog exists, but checkout remains fail-closed until Superadmin publishes a provider-backed price.</p></div></div>}
    </section>

    <section className="workspace-card"><header><h2>Your plan includes</h2><span>{currentPlan ? String(currentPlan.name) : "No active paid plan"}</span></header>
      {currentAllowances.length ? currentAllowances.map((item)=><div className="project-row" key={item.entitlement_key}><div><b>{label(item.entitlement_key)}</b><small>{item.entitlement_key}</small></div><strong>{humanize(item.entitlement_value)}</strong></div>) : <div className="empty-state"><div><b>No plan allowances are published for this account.</b><p>Limits remain fail-closed until they are defined in the catalog.</p></div></div>}
    </section>

    <section className="workspace-card"><header><h2>Credit packs</h2><span>One-time purchases</span></header>
      {credits.data?.length ? credits.data.map((item)=><div className="project-row" key={item.id}><div><b>{item.name}</b><small>{Number(item.credits).toLocaleString()} credits · {item.description || "Additional usage credits"}</small></div><div style={{display:"flex",alignItems:"center",gap:14}}><strong>{money(item.unit_amount_minor,item.currency)}</strong><CheckoutButton kind="credit_pack" id={item.id}>Buy credits</CheckoutButton></div></div>) : <div className="empty-state"><div><b>No credit packs are active.</b><p>Superadmin can publish credit products without changing application code.</p></div></div>}
    </section>

    <section className="workspace-card"><header><h2>How credits are used</h2><span>Active rates</span></header>
      {creditRates.data?.length ? creditRates.data.map((rate)=><div className="project-row" key={rate.id}><div><b>{label(rate.metric)}</b><small>Per {String(rate.unit).replaceAll("_"," ")}</small></div><strong>{Number(rate.credits_per_unit).toLocaleString()} credits</strong></div>) : <div className="empty-state"><div><b>No usage rates are published yet.</b><p>Credit deductions remain disabled until an active rate exists.</p></div></div>}
    </section>

    <section className="workspace-card"><header><h2>Payment history</h2><span>Latest 20</span></header>{transactions.data?.length ? transactions.data.map((tx)=><div className="project-row" key={tx.id}><div><b>{String(tx.kind).replaceAll("_"," ")}</b><small>{tx.status} · {new Date(tx.created_at).toLocaleString("en-GB")}{Number(tx.credits)>0?` · ${Number(tx.credits).toLocaleString()} credits`:""}</small></div><span>{money(tx.amount_minor,tx.currency)}</span></div>) : <div className="empty-state"><div><b>No purchases yet.</b><p>Successful provider webhooks will appear here.</p></div></div>}</section>
  </div>;
}
