"use client";

import { FormEvent, useState } from "react";

type State = { kind: "idle" | "loading" | "success" | "error"; message?: string; referral?: string };

export function WaitlistForm({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/v1/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify(Object.fromEntries(data.entries())),
      });
      const payload = await response.json() as { ok?: boolean; referralCode?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to join right now.");
      form.reset();
      setState({ kind: "success", message: "You're on the VEXONYX waitlist.", referral: payload.referralCode });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Unable to join right now." });
    }
  }

  if (state.kind === "success") return <div className="form-success" role="status"><span>✓</span><div><strong>{state.message}</strong><p>We’ll use your verified email for launch access. {state.referral ? `Referral code: ${state.referral}` : ""}</p></div></div>;

  return (
    <form className={compact ? "waitlist-form compact" : "waitlist-form"} onSubmit={submit}>
      <label><span>Email address</span><input name="email" type="email" autoComplete="email" required maxLength={320} placeholder="you@company.com" /></label>
      {compact ? null : <><label><span>Name</span><input name="name" autoComplete="name" maxLength={120} placeholder="Your name" /></label><label><span>Company</span><input name="company" autoComplete="organization" maxLength={160} placeholder="Company" /></label><label><span>Role</span><input name="job_role" maxLength={120} placeholder="Security engineer" /></label></>}
      <input type="hidden" name="source" value="website" />
      <button className="button" disabled={state.kind === "loading"} type="submit">{state.kind === "loading" ? "Joining…" : "Join the waitlist"}</button>
      {state.kind === "error" ? <p className="form-error" role="alert">{state.message}</p> : null}
      <p className="form-note">No inflated counters. No customer data in demos. Launch access is invitation-based.</p>
    </form>
  );
}
