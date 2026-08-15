"use client";

import { useState } from "react";

async function openBillingEndpoint(path: string, body?: Record<string, string>) {
  const response = await fetch(path, { method: "POST", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
  if (!response.ok || !payload.url) throw new Error(payload.error || "billing_request_failed");
  window.location.assign(payload.url);
}

export function CheckoutButton({ kind, id, children }: { kind: "subscription" | "credit_pack"; id: string; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <div><button className="button button-small" type="button" disabled={busy} onClick={async()=>{setBusy(true);setError(null);try{await openBillingEndpoint("/api/v1/billing/checkout", kind === "subscription" ? { kind, price_id:id } : { kind, credit_product_id:id });}catch(e){setError(e instanceof Error && e.message === "billing_not_enabled" ? "Payments are not enabled yet." : "Checkout is temporarily unavailable.");setBusy(false);}}}>{busy ? "Opening…" : children}</button>{error ? <small style={{display:"block",marginTop:8}}>{error}</small> : null}</div>;
}

export function BillingPortalButton() {
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  return <div><button className="button button-small secondary" type="button" disabled={busy} onClick={async()=>{setBusy(true);setError(null);try{await openBillingEndpoint("/api/v1/billing/portal");}catch{setError("Billing portal is not available for this account yet.");setBusy(false);}}}>{busy?"Opening…":"Manage subscription"}</button>{error?<small style={{display:"block",marginTop:8}}>{error}</small>:null}</div>;
}
