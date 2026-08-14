import { Brand } from "@/components/brand";
import {
  completeAdminPasswordReset,
  startAdminPasswordLogin,
  startAdminPasswordReset,
  verifyAdminLoginCode,
} from "./actions";

export const metadata = {
  title: "VEXONYX Superadmin",
  robots: { index: false, follow: false },
};

function errorMessage(error: string | null) {
  switch (error) {
    case "invalid_credentials": return "The credentials could not be verified. Check the password and try again.";
    case "invalid_code": return "The verification code is invalid or has already been used.";
    case "expired_challenge": return "This authentication attempt expired. Start again to receive a new code.";
    case "password_rules": return "Use a password between 16 and 128 characters and make sure both password fields match.";
    case "password_update": return "The password could not be updated. Request a new reset code and try again.";
    case "delivery": return "The verification email could not be delivered right now. Try again shortly.";
    case "configuration": return "Administrator authentication is temporarily unavailable.";
    default: return null;
  }
}

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const step = typeof params.step === "string" ? params.step : "login";
  const error = typeof params.error === "string" ? params.error : null;
  const passwordUpdated = params.password === "updated";
  const resetSent = params.reset_sent === "1";
  const message = errorMessage(error);

  return (
    <main className="auth-page">
      <section className="auth-card" style={{ maxWidth: 500 }}>
        <Brand />
        <div className="section-label" style={{ marginTop: 28 }}>SUPERADMIN · TWO-STEP ACCESS</div>
        <h1>VEXONYX Admin</h1>
        <p>Password access is protected by a one-time verification code sent to the authorized Superadmin email before a session is created.</p>

        {passwordUpdated ? (
          <div className="form-success" style={{ marginTop: 20 }}>
            <span>✓</span>
            <div><strong>Password updated</strong><p>Sign in with the new password. A fresh email verification code will still be required.</p></div>
          </div>
        ) : null}

        {resetSent ? (
          <div className="form-success" style={{ marginTop: 20 }}>
            <span>✓</span>
            <div><strong>Request received</strong><p>If the address is an authorized Superadmin identity, password recovery instructions have been issued.</p></div>
          </div>
        ) : null}

        {step === "verify" ? (
          <form className="auth-form" action={verifyAdminLoginCode}>
            <label>
              <span>EMAIL VERIFICATION CODE</span>
              <input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="000000" />
            </label>
            <button className="button" type="submit">Verify and open Superadmin</button>
            <a href="/admin-login" className="button secondary">Start over</a>
            {message ? <p className="form-error">{message}</p> : null}
          </form>
        ) : step === "reset_verify" ? (
          <form className="auth-form" action={completeAdminPasswordReset}>
            <label>
              <span>PASSWORD RESET CODE</span>
              <input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="000000" />
            </label>
            <label>
              <span>NEW PASSWORD</span>
              <input name="password" type="password" autoComplete="new-password" minLength={16} maxLength={128} required placeholder="At least 16 characters" />
            </label>
            <label>
              <span>CONFIRM NEW PASSWORD</span>
              <input name="confirm_password" type="password" autoComplete="new-password" minLength={16} maxLength={128} required placeholder="Repeat password" />
            </label>
            <button className="button" type="submit">Verify code and set password</button>
            <a href="/admin-login" className="button secondary">Cancel</a>
            {message ? <p className="form-error">{message}</p> : null}
          </form>
        ) : (
          <>
            <form className="auth-form" action={startAdminPasswordLogin}>
              <label>
                <span>ADMIN EMAIL</span>
                <input name="email" type="email" autoComplete="username" maxLength={320} required placeholder="admin email" />
              </label>
              <label>
                <span>PASSWORD</span>
                <input name="password" type="password" autoComplete="current-password" maxLength={128} required placeholder="Your password" />
              </label>
              <button className="button" type="submit">Continue securely</button>
              {message ? <p className="form-error">{message}</p> : null}
            </form>

            <div className="auth-foot" style={{ marginTop: 24 }}>
              <strong style={{ color: "var(--foreground)" }}>Create, reset or recover the Superadmin password</strong>
              <p style={{ margin: "7px 0 12px" }}>Password setup and recovery require control of the authorized Superadmin email and do not open public signup.</p>
              <form className="auth-form" action={startAdminPasswordReset}>
                <label>
                  <span>ADMIN EMAIL</span>
                  <input name="email" type="email" autoComplete="email" maxLength={320} required placeholder="admin email" />
                </label>
                <button className="button secondary" type="submit">Send password setup/reset code</button>
              </form>
            </div>
          </>
        )}

        <div className="auth-foot">Public customer login and signup remain closed during the waitlist phase. Superadmin authentication is separate from customer access.</div>
      </section>
    </main>
  );
}
