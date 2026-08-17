"use client";

import { FormEvent, useState } from "react";
import styles from "./waitlist-form.module.css";

type State = {
  kind: "idle" | "loading" | "success" | "error";
  message?: string;
};

type SignupType = "individual" | "company";

export function WaitlistForm({ compact = false, referralCode }: { compact?: boolean; referralCode?: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [signupType, setSignupType] = useState<SignupType>("individual");

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
      const payload = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok && response.status !== 202) throw new Error(payload.error ?? "Unable to join right now.");
      form.reset();
      setSignupType("individual");
      setState({
        kind: "success",
        message: payload.message ?? "If this address still needs verification, we'll email a link shortly. If it's already on the list, no action is required.",
      });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Unable to join right now." });
    }
  }

  if (state.kind === "success") {
    return (
      <div className="form-success" role="status">
        <span>✓</span>
        <div>
          <strong>Request received.</strong>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  return (
    <form className={compact ? "waitlist-form compact" : "waitlist-form"} onSubmit={submit}>
      {!compact ? (
        <fieldset className={styles.choice}>
          <legend>I&apos;m joining as</legend>
          <div className={styles.grid}>
            <label className={`${styles.option} ${signupType === "individual" ? styles.optionSelected : ""}`}>
              <input type="radio" name="signup_type" value="individual" checked={signupType === "individual"} onChange={() => setSignupType("individual")} />
              <span><strong>Individual</strong><small>Researcher, student, developer or security professional</small></span>
            </label>
            <label className={`${styles.option} ${signupType === "company" ? styles.optionSelected : ""}`}>
              <input type="radio" name="signup_type" value="company" checked={signupType === "company"} onChange={() => setSignupType("company")} />
              <span><strong>Company or team</strong><small>Security team, consultancy, startup or enterprise</small></span>
            </label>
          </div>
        </fieldset>
      ) : <input type="hidden" name="signup_type" value="individual" />}

      <label><span>Email address</span><input name="email" type="email" autoComplete="email" required maxLength={320} placeholder="you@example.com" /></label>

      {compact ? null : (
        <>
          <label><span>Name</span><input name="name" autoComplete="name" maxLength={120} placeholder="Your name" /></label>
          {signupType === "company" ? (
            <label><span>Company or team</span><input name="company" autoComplete="organization" maxLength={160} required placeholder="Company or team name" /></label>
          ) : null}
          <label>
            <span>{signupType === "company" ? "Role (optional)" : "Background (optional)"}</span>
            <input name="job_role" maxLength={120} placeholder={signupType === "company" ? "Security engineer" : "Student, developer, researcher…"} />
          </label>
        </>
      )}

      <label aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <span>Website</span>
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      {referralCode ? <input type="hidden" name="ref" value={referralCode} /> : null}
      <button className="button" disabled={state.kind === "loading"} type="submit">{state.kind === "loading" ? "Joining…" : "Join the waitlist"}</button>
      {state.kind === "error" ? <p className="form-error" role="alert">{state.message}</p> : null}
      <p className="form-note">Individuals and companies are both welcome. If this address is new or still pending, we&apos;ll email a verification link. We intentionally do not reveal whether an address is already registered. We process the information you submit to manage and secure the waitlist as described in our <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>Privacy Notice</a>.</p>
    </form>
  );
}
