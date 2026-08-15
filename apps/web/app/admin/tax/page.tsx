import { requireSuperadmin } from "@/lib/admin/guard";
import { confirmTaxClassification, refreshStripeTaxState, setAutomaticTaxCollection } from "../tax-actions";

function status(value: unknown) {
  return String(value || "unknown").replaceAll("_", " ");
}

export default async function AdminTaxPage() {
  const { admin } = await requireSuperadmin();
  const [settings, plans, creditProducts] = await Promise.all([
    admin.schema("billing").from("tax_settings").select("provider,head_office,default_tax_behavior,automatic_collection_enabled,active_registration_count,last_registration_check_at,metadata,updated_at").eq("provider", "stripe").maybeSingle(),
    admin.schema("billing").from("plans").select("id,code,name,status,is_public,tax_code,tax_code_candidate,tax_classification_status,provider_product_id,provider_sync_status").order("display_order").order("name"),
    admin.schema("billing").from("credit_products").select("id,code,name,active,tax_code,tax_code_candidate,tax_classification_status,tax_behavior,provider_product_id,provider_sync_status").order("display_order").order("name"),
  ]);

  const tax = settings.data;
  const planRows = plans.data ?? [];
  const creditRows = creditProducts.data ?? [];
  const activeItems = [
    ...planRows.filter((item) => item.status === "active" && item.is_public),
    ...creditRows.filter((item) => item.active),
  ];
  const incomplete = activeItems.filter((item) => !item.tax_code || item.tax_classification_status !== "confirmed");
  const head = (tax?.head_office && typeof tax.head_office === "object" ? tax.head_office : {}) as Record<string, unknown>;
  const collectionCanEnable = Number(tax?.active_registration_count ?? 0) > 0 && incomplete.length === 0;

  return <div className="admin-page">
    <div className="admin-heading"><div className="admin-heading-copy"><div className="admin-eyebrow">VEXONYX / COMMERCE / TAX</div><h1>Tax readiness</h1><p>Tax infrastructure is separated from tax collection. Prices stay exclusive of applicable tax. Collection can only be enabled after the relevant authority registration is recorded in Stripe and every active product has a human-confirmed Stripe tax classification.</p></div></div>

    <section className="admin-grid equal">
      <article className="admin-card"><div className="admin-card-header"><h2>Stripe Tax</h2><span>{tax?.automatic_collection_enabled ? "Collection enabled" : "Collection off"}</span></div><div className="admin-card-body admin-health">
        <div className="admin-health-row"><span>Head office</span><b>{head.city ? `${head.city}, ${head.state || ""} ${head.country || ""}` : "Not synchronized"}</b></div>
        <div className="admin-health-row"><span>Default price behavior</span><b>{String(tax?.default_tax_behavior || "exclusive")}</b></div>
        <div className="admin-health-row"><span>Active Stripe registrations</span><b>{Number(tax?.active_registration_count ?? 0)}</b></div>
        <div className="admin-health-row"><span>Unconfirmed active catalog items</span><b>{incomplete.length}</b></div>
        <div className="admin-health-row"><span>Last provider check</span><b>{tax?.last_registration_check_at ? new Date(tax.last_registration_check_at).toLocaleString("en-GB") : "Never"}</b></div>
        <form action={refreshStripeTaxState}><button className="admin-button" type="submit">Refresh from Stripe</button></form>
      </div></article>

      <article className="admin-card"><div className="admin-card-header"><h2>Collection gate</h2><span>Fail closed</span></div><div className="admin-card-body admin-health">
        <div className="admin-health-row"><span>Customer prices</span><b>Tax exclusive</b></div>
        <div className="admin-health-row"><span>Tax IDs in Checkout</span><b>Collected</b></div>
        <div className="admin-health-row"><span>Automatic calculation</span><b>{tax?.automatic_collection_enabled ? "Enabled" : "Disabled"}</b></div>
        <div className="admin-health-row"><span>Ready to enable</span><b>{collectionCanEnable ? "Yes" : "No"}</b></div>
        {tax?.automatic_collection_enabled ? <form action={setAutomaticTaxCollection}><input type="hidden" name="enabled" value="false"/><button className="admin-button" type="submit">Disable automatic tax</button></form> : <form action={setAutomaticTaxCollection}><input type="hidden" name="enabled" value="true"/><button className="admin-button primary" type="submit" disabled={!collectionCanEnable}>Enable automatic tax</button></form>}
        {!collectionCanEnable && !tax?.automatic_collection_enabled ? <small>Enabling stays locked until Stripe reports at least one active tax registration and every active plan/top-up is confirmed below.</small> : null}
      </div></article>
    </section>

    <section className="admin-card"><div className="admin-card-header"><h2>Subscription classification</h2><span>Stripe candidate: txcd_10105002</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Plan</th><th>State</th><th>Tax classification</th><th>Provider</th><th>Confirmation</th></tr></thead><tbody>{planRows.map((plan) => <tr key={plan.id}>
      <td><b>{plan.name}</b><small>{plan.code}</small></td>
      <td><b>{plan.status}</b><small>{plan.is_public ? "Customer-visible" : "Private"}</small></td>
      <td><b>{status(plan.tax_classification_status)}</b><small>{plan.tax_code ? `Confirmed: ${plan.tax_code}` : `Candidate: ${plan.tax_code_candidate || "none"}`}</small></td>
      <td><b>{status(plan.provider_sync_status)}</b><small>{plan.provider_product_id || "No Stripe Product"}</small></td>
      <td>{plan.tax_classification_status === "confirmed" ? <b>Confirmed</b> : <form action={confirmTaxClassification}><input type="hidden" name="resource_type" value="plan"/><input type="hidden" name="resource_id" value={plan.id}/><input className="admin-input" name="tax_code" defaultValue={plan.tax_code_candidate || "txcd_10105002"}/><small>Candidate means Artificial Intelligence as a Service, cloud-based, business use. Confirm only after the business tax treatment has been approved.</small><button className="admin-button" type="submit" disabled={plan.provider_sync_status !== "synced"}>Confirm classification</button></form>}</td>
    </tr>)}</tbody></table></div></section>

    <section className="admin-card"><div className="admin-card-header"><h2>Prepaid credit classification</h2><span>Requires separate review</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Credit pack</th><th>State</th><th>Tax classification</th><th>Provider</th><th>Confirmation</th></tr></thead><tbody>{creditRows.map((item) => <tr key={item.id}>
      <td><b>{item.name}</b><small>{item.code}</small></td>
      <td><b>{item.active ? "Active" : "Inactive"}</b><small>{item.tax_behavior} tax behavior</small></td>
      <td><b>{status(item.tax_classification_status)}</b><small>{item.tax_code ? `Confirmed: ${item.tax_code}` : `Candidate: ${item.tax_code_candidate || "none"}`}</small></td>
      <td><b>{status(item.provider_sync_status)}</b><small>{item.provider_product_id || "No Stripe Product"}</small></td>
      <td>{item.tax_classification_status === "confirmed" ? <b>Confirmed</b> : <form action={confirmTaxClassification}><input type="hidden" name="resource_type" value="credit_product"/><input type="hidden" name="resource_id" value={item.id}/><input className="admin-input" name="tax_code" defaultValue={item.tax_code_candidate || "txcd_10105002"}/><small>These credits are prepaid, restricted VEXONYX usage. Their tax point/classification must be explicitly approved before this button is used.</small><button className="admin-button" type="submit" disabled={item.provider_sync_status !== "synced"}>Confirm classification</button></form>}</td>
    </tr>)}</tbody></table></div></section>

    <section className="admin-card"><div className="admin-card-header"><h2>Policy</h2><span>No automatic registrations</span></div><div className="admin-card-body"><p>VEXONYX never creates a tax registration merely because a sales threshold is approached. Registration with the relevant tax authority is a legal/accounting action. After that registration exists, record it in Stripe, refresh this page, confirm the catalog tax treatment, and only then enable automatic collection.</p></div></section>
  </div>;
}
