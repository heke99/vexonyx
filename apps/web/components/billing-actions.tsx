"use client";

import { useState } from "react";

async function openBillingEndpoint(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
  if (!response.ok || !payload.url) throw new Error(payload.error || "billing_request_failed");
  const destination = new URL(payload.url);
  if (destination.protocol !== "https:") throw new Error("invalid_billing_redirect");
  const anchor = document.createElement("a");
  anchor.href = destination.toString();
  anchor.rel = "noopener noreferrer";
  anchor.click();
}

function LegalLinks() {
  return <>
    <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>Terms</a>,{" "}
    <a href="/refunds" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>Refund & Cancellation Policy</a> and{" "}
    <a href="/acceptable-use" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>Acceptable Use Policy</a>
  </>;
}

export function CheckoutButton({ kind, id, children }: { kind: "subscription" | "credit_pack"; id: string; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [accepted, setAccepted] = useState(false);

  async function beginCheckout() {
    setBusy(true);
    setError(null);
    try {
      await openBillingEndpoint("/api/v1/billing/checkout", {
        kind,
        ...(kind === "subscription" ? { price_id: id } : { credit_product_id: id }),
        legal: {
          terms: true,
          refund_policy: true,
          acceptable_use: true,
          immediate_performance: true,
          professional_use: true,
          auto_renewal: kind === "subscription",
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(message === "billing_not_enabled"
        ? "Payments are not enabled yet."
        : message === "legal_acceptance_required"
          ? "Purchase terms must be accepted before checkout."
          : "Checkout is temporarily unavailable.");
      setBusy(false);
    }
  }

  if (confirming) {
    return <div style={{ width: "min(390px, 80vw)", border: "1px solid #30363e", borderRadius: 10, padding: 12, background: "#0b0e11" }}>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 10, lineHeight: 1.55, color: "#a8aeb7" }}>
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} style={{ marginTop: 2 }} />
        <span>
          I agree to the <LegalLinks />. I request immediate access after successful payment and confirm this purchase is for professional, business, research or authorized cybersecurity use.
          {kind === "subscription" ? " I understand the plan renews automatically each month at the displayed price plus applicable tax until future renewal is cancelled." : " I understand purchased credits are non-refundable and have no cash redemption value, except where mandatory law requires otherwise."}
        </span>
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="button button-small" type="button" disabled={!accepted || busy} onClick={beginCheckout}>{busy ? "Opening…" : "Agree & continue"}</button>
        <button className="button button-small secondary" type="button" disabled={busy} onClick={() => { setConfirming(false); setAccepted(false); setError(null); }}>Back</button>
      </div>
      {error ? <small style={{ display: "block", marginTop: 8 }}>{error}</small> : null}
    </div>;
  }

  return <div>
    <button className="button button-small" type="button" disabled={busy} onClick={() => { setError(null); setConfirming(true); }}>{children}</button>
    {error ? <small style={{ display: "block", marginTop: 8 }}>{error}</small> : null}
  </div>;
}

export function CancelSubscriptionButton({ periodEnd }: { periodEnd?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancelRenewal() {
    const endLabel = periodEnd ? new Date(periodEnd).toLocaleDateString("en-GB") : "the end of the current paid period";
    if (!window.confirm(`Stop automatic renewal? Your paid plan remains active until ${endLabel}. No prorated refund is issued for the current paid period except where mandatory law requires otherwise.`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/billing/cancel", { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "cancellation_failed");
      window.location.reload();
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(message === "billing_admin_required" ? "Only an organization owner or admin can cancel billing." : "Cancellation could not be completed. Try again or contact info@vexonyx.com.");
      setBusy(false);
    }
  }

  return <div>
    <button className="button button-small secondary" type="button" disabled={busy} onClick={cancelRenewal}>{busy ? "Cancelling…" : "Cancel renewal"}</button>
    {error ? <small style={{ display: "block", marginTop: 8 }}>{error}</small> : null}
  </div>;
}

export function BillingPortalButton() {
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  return <div><button className="button button-small secondary" type="button" disabled={busy} onClick={async()=>{setBusy(true);setError(null);try{await openBillingEndpoint("/api/v1/billing/portal");}catch{setError("Billing portal is not available for this account yet.");setBusy(false);}}}>{busy?"Opening…":"Manage billing"}</button>{error?<small style={{display:"block",marginTop:8}}>{error}</small>:null}</div>;
}
