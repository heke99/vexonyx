"use client";

import { useActionState } from "react";
import { createWaitlistAccount, type WaitlistAccessState } from "@/app/waitlist/access/actions";

const initialState: WaitlistAccessState = {};

export function WaitlistAccessForm({ entry, token }: { entry: string; token: string }) {
  const [state, action, pending] = useActionState(createWaitlistAccount, initialState);

  return (
    <form className="waitlist-form" action={action}>
      <input type="hidden" name="entry" value={entry} />
      <input type="hidden" name="token" value={token} />
      <label>
        <span>Password</span>
        <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      </label>
      <label>
        <span>Confirm password</span>
        <input name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      </label>
      <button className="button" type="submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <p className="form-note">This invitation is bound to the verified email address from your VEXONYX waitlist registration. Creating the account converts that same waitlist identity; it does not create a second lead record.</p>
    </form>
  );
}
