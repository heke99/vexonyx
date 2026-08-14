"use client";

import { FormEvent, useState } from "react";

type State = {
  kind: "idle" | "loading" | "success" | "error";
  message?: string;
  verified?: boolean;
  referral?: string;
  verificationDelivery?: string;
};

export function WaitlistForm({ compact = false, referralCode }: { compact?: boolean; referralCode?: string }) {
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
      const payload = await response.json() as { ok?: boolean; verified?: boolean; referralCode?: string; verificationDelivery?: string; error?: string };
      if (!response.ok && response.status !== 202) throw new Error(payload.error ?? "Unable to join right now.");
      form.reset();
      setState({
        kind: "success",
        verified: payload.verified,
        referral: payload.referralCode,
        verificationDelivery: payload.verificationDelivery,
        message: payload.verified ? "Your VEXONYX waitlist email is already verified." : payload.verificationDelivery === "sent" ? "Check your email to finish joining the VEXONYX waitlist." : "You're registered. Email verification is not available yet.",
      });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Unable to join right now." });
    }
  }

  if (state.kind === "success") return <div className="form-success" role="status"><span>✓</span><div><strong>{state.message}</strong><p>{state.verified && state.referral ? `Referral code: ${state.referral}` : state.verificationDelivery === "sent" ? "The verification link expires in 30 minutes. Your referral link appears after verification." : "Your registration remains pending until email verification is enabled."}</p></div></div>;

  return (
    <form className={compact ? "waitlist-form compact" : "waitlist-form"} onSubmit={submit}>
      <label><span>Email address</span><input name="email" type="email" autoComplete="email" required maxLength={320} placeholder="you@company.com" /></label>
      {compact ? null : <><label><span>Name</span><input name="name" autoComplete="name" maxLength={120} placeholder="Your name" /></label><label><span>Company</span><input name="company" autoComplete="organization" maxLength={160} placeholder="Company" /></label><label><span>Role</span><input name="job_role" maxLength={120} placeholder="Security engineer" /></label></>}
      <input type="hidden" name="source" value="website" />
      {referralCode ? <input type="hidden" name="ref" value={referralCode} /> : null}
      <button className="button" disabled={state.kind === "loading"} type="submit">{state.kind === "loading" ? "Joining…" : "Join the waitlist"}</button>
      {state.kind === "error" ? <p className="form-error" role="alert">{state.message}</p> : null}
      <p className="form-note">Real registrations only. No customer project data is used in marketing demos.</p>
    </form>
  );
}
