import { requireSuperadmin } from "@/lib/admin/guard";
import { retryCreditProductProviderSync, setCreditProductActive, adjustCredits, saveCreditProduct } from "../commerce-actions";

function money(minor: unknown, currency: unknown) {
  return new Intl.NumberFormat("en", { style: "currency", currency: String(currency || "USD") }).format(Number(minor || 0) / 100);
}
function shortId(value: unknown) {
  const id = String(value || "");
  return id ? (id.length > 28 ? `${id.slice(0, 16)}…${id.slice(-8)}` : id) : "—";
}

export default async function AdminCreditsPage() {
  const { admin } = await requireSuperadmin();
  const [products, accounts, ledger, orgs] = await Promise.all([
    admin.schema("billing").from("credit_products").select("id,code,name,description,credits,currency,unit_amount_minor,provider,provider_product_id,provider_price_id,provider_sync_status,provider_sync_error,provider_synced_at,active,updated_at").order("display_order"),
    admin.schema("billing").from("credit_accounts").select("organization_id,balance,lifetime_purchased,lifetime_granted,lifetime_consumed,updated_at").order("balance", { ascending: false }).limit(500),
    admin.schema("billing").from("credit_ledger").select("id,organization_id,user_id,entry_type,amount,balance_after,external_reference,metadata,created_at").order("created_at", { ascending: false }).limit(100),
    admin.schema("app").from("organizations").select("id,name,status").order("name").limit(1000),
  ]);
  const orgName = new Map((orgs.data ?? []).map((org) => [org.id, org.name]));
  const synced = (products.data ?? []).filter((product) => product.provider_sync_status === "synced" && product.provider_product_id && product.provider_price_id).length;
  const active = (products.data ?? []).filter((product) => product.active && product.provider_sync_status === "synced").length;

  return <div className="admin-page">
    <div className="admin-heading"><div className="admin-heading-copy"><div className="admin-eyebrow">VEXONYX / COMMERCE</div><h1>Credits</h1><p>Credit packs use the same provider-sync rules as subscriptions. VEXONYX owns the ledger and credit quantity; Stripe owns the one-time Product, Price and payment.</p></div></div>

    <section className="admin-grid equal">
      <article className="admin-card"><div className="admin-card-header"><h2>Create credit pack</h2><span>Auto-sync Product + Price</span></div><form className="admin-card-body admin-form" action={saveCreditProduct}>
        <input className="admin-input" name="code" placeholder="credits_10k" required/>
        <input className="admin-input" name="name" placeholder="10,000 credits" required/>
        <textarea className="admin-input" name="description" placeholder="Optional description"/>
        <input className="admin-input" name="credits" type="number" min="1" placeholder="10000" required/>
        <input className="admin-input" name="unit_amount_minor" type="number" min="1" placeholder="2500" required/>
        <input className="admin-input" name="currency" defaultValue="USD" maxLength={3}/>
        <label><input type="checkbox" name="active" value="true"/> Activate for customer checkout after Stripe sync</label>
        <small>VEXONYX creates both the Stripe Product and immutable Price. No provider ID is entered manually.</small>
        <button className="admin-button primary" type="submit">Create pack & sync Stripe</button>
      </form></article>
      <article className="admin-card"><div className="admin-card-header"><h2>Credit catalog</h2><span>Provider health</span></div><div className="admin-card-body admin-health">
        <div className="admin-health-row"><span>Total packs</span><b>{products.data?.length ?? 0}</b></div>
        <div className="admin-health-row"><span>Stripe synced</span><b>{synced}</b></div>
        <div className="admin-health-row"><span>Customer checkout active</span><b>{active}</b></div>
        <div className="admin-health-row"><span>Manual provider IDs</span><b>Disabled</b></div>
      </div></article>
    </section>

    <section className="admin-grid equal">
      <article className="admin-card"><div className="admin-card-header"><h2>Manual adjustment</h2><span>Audited ledger entry</span></div><form className="admin-card-body admin-form" action={adjustCredits}>
        <select className="admin-input" name="organization_id" required><option value="">Choose organization</option>{(orgs.data ?? []).map((org) => <option key={org.id} value={org.id}>{org.name} · {org.status}</option>)}</select>
        <input className="admin-input" name="amount" type="number" placeholder="5000 or -5000" required/>
        <textarea className="admin-input" name="reason" placeholder="Reason for adjustment" required/>
        <button className="admin-button" type="submit">Apply adjustment</button>
      </form></article>
      <article className="admin-card"><div className="admin-card-header"><h2>Ledger safety</h2><span>Append-only history</span></div><div className="admin-card-body admin-health">
        <div className="admin-health-row"><span>Balance mutation</span><b>Atomic RPC</b></div>
        <div className="admin-health-row"><span>Purchase idempotency</span><b>Webhook event</b></div>
        <div className="admin-health-row"><span>Overdraft</span><b>Blocked</b></div>
        <div className="admin-health-row"><span>Admin changes</span><b>Reason + audit</b></div>
      </div></article>
    </section>

    <section className="admin-card"><div className="admin-card-header"><h2>Credit products</h2><span>{products.data?.length ?? 0}</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Credits</th><th>Price</th><th>Stripe sync</th><th>Checkout</th><th>Actions</th></tr></thead><tbody>{(products.data ?? []).map((product) => <tr key={product.id}>
      <td><b>{product.name}</b><small>{product.code}</small>{product.description ? <small>{product.description}</small> : null}</td>
      <td>{Number(product.credits).toLocaleString()}</td>
      <td>{money(product.unit_amount_minor, product.currency)}</td>
      <td><b>{String(product.provider_sync_status).replaceAll("_", " ")}</b><small>Product: {shortId(product.provider_product_id)}</small><small>Price: {shortId(product.provider_price_id)}</small>{product.provider_sync_error ? <small>Last error: {product.provider_sync_error}</small> : null}</td>
      <td><b>{product.active ? "Active" : "Inactive"}</b><small>{product.active && product.provider_sync_status === "synced" ? "Customer checkout ready" : "Not offered to customers"}</small></td>
      <td><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{product.provider_sync_status !== "synced" || !product.provider_product_id || !product.provider_price_id ? <form action={retryCreditProductProviderSync}><input type="hidden" name="product_id" value={product.id}/><button className="admin-button" type="submit">Retry Stripe sync</button></form> : <form action={setCreditProductActive}><input type="hidden" name="product_id" value={product.id}/><input type="hidden" name="active" value={product.active ? "false" : "true"}/><button className="admin-button" type="submit">{product.active ? "Deactivate" : "Activate"}</button></form>}</div></td>
    </tr>)}</tbody></table></div></section>

    <section className="admin-card"><div className="admin-card-header"><h2>Organization balances</h2><span>{accounts.data?.length ?? 0}</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Organization</th><th>Balance</th><th>Purchased</th><th>Granted</th><th>Consumed</th></tr></thead><tbody>{(accounts.data ?? []).map((account) => <tr key={account.organization_id}><td><b>{orgName.get(account.organization_id) || account.organization_id}</b><small>{account.organization_id}</small></td><td>{Number(account.balance).toLocaleString()}</td><td>{Number(account.lifetime_purchased).toLocaleString()}</td><td>{Number(account.lifetime_granted).toLocaleString()}</td><td>{Number(account.lifetime_consumed).toLocaleString()}</td></tr>)}</tbody></table></div></section>

    <section className="admin-card"><div className="admin-card-header"><h2>Ledger</h2><span>Latest 100</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Organization</th><th>Entry</th><th>Amount</th><th>Balance after</th><th>Reference</th><th>Time</th></tr></thead><tbody>{(ledger.data ?? []).map((entry) => <tr key={entry.id}><td>{orgName.get(entry.organization_id) || entry.organization_id}</td><td>{entry.entry_type}</td><td>{Number(entry.amount).toLocaleString()}</td><td>{Number(entry.balance_after).toLocaleString()}</td><td><small>{entry.external_reference || "—"}</small></td><td>{new Date(entry.created_at).toLocaleString("en-GB")}</td></tr>)}</tbody></table></div></section>
  </div>;
}
