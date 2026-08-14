import { Brand } from "@/components/brand";
import { requestAdminMagicLink } from "./actions";

export const metadata = {
  title: "VEXONYX Superadmin",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const sent = params.sent === "1";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="auth-page">
      <section className="auth-card" style={{ maxWidth: 480 }}>
        <Brand />
        <div className="section-label" style={{ marginTop: 28 }}>SUPERADMIN · SECURE ACCESS</div>
        <h1>VEXONYX Admin</h1>
        <p>Private operator access for Diversa Solutions LLC. Public customer login remains closed during the waitlist phase.</p>

        {sent ? (
          <div className="form-success" style={{ marginTop: 20 }}>
            <span>✓</span>
            <div><strong>Check your inbox</strong><p>If the address is authorized, a secure one-time sign-in link has been sent.</p></div>
          </div>
        ) : (
          <form className="auth-form" action={requestAdminMagicLink}>
            <label>
              <span>ADMIN EMAIL</span>
              <input name="email" type="email" autoComplete="email" required placeholder="admin email" />
            </label>
            <button className="button" type="submit">Send secure sign-in link</button>
            {error ? <p className="form-error">Unable to send a secure sign-in link right now. Try again shortly.</p> : null}
          </form>
        )}

        <div className="auth-foot">No public signup is available here. Administrator links are single-use and access is verified again before the console loads.</div>
      </section>
    </main>
  );
}
