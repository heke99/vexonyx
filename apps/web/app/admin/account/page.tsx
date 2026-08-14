import { requireSuperadmin } from "@/lib/admin/guard";
import { changeAdminPassword } from "../actions";

export const dynamic = "force-dynamic";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function AdminAccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { admin, userId } = await requireSuperadmin();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const { data } = await admin.auth.admin.getUserById(userId);
  const user = data.user;

  return (
    <div className="admin-page">
      <div className="admin-heading">
        <div className="admin-heading-copy">
          <div className="admin-eyebrow">VEXONYX / SUPERADMIN / SECURITY</div>
          <h1>Account security</h1>
          <p>Manage the operator credential used before the mandatory email verification step. Customer authentication remains separate and closed during the waitlist phase.</p>
        </div>
      </div>

      <div className="admin-detail-grid" style={{ marginBottom: 10 }}>
        <article className="admin-detail-card"><span>Account email</span><strong>{user?.email ?? "—"}</strong><small>Private Superadmin identity</small></article>
        <article className="admin-detail-card"><span>Last sign-in</span><strong>{formatDate(user?.last_sign_in_at)}</strong><small>Supabase Auth session activity</small></article>
        <article className="admin-detail-card"><span>Second step</span><strong>Required every login</strong><small>6-digit code sent by VEXONYX through Resend</small></article>
      </div>

      <section className="admin-card">
        <header className="admin-card-header"><h2>Change Superadmin password</h2><span>Recent verified session required</span></header>
        <div className="admin-card-body" style={{ maxWidth: 620 }}>
          <div className="admin-note" style={{ marginBottom: 16 }}>
            Use a unique password of at least 16 characters. After the change, all current Supabase sessions are revoked and you must sign in again with the new password plus an email verification code.
          </div>
          <form action={changeAdminPassword} style={{ display: "grid", gap: 12 }}>
            <label>
              <span className="admin-count" style={{ display: "block", marginBottom: 6 }}>NEW PASSWORD</span>
              <input className="admin-input" style={{ width: "100%" }} name="password" type="password" autoComplete="new-password" minLength={16} maxLength={128} required placeholder="At least 16 characters" />
            </label>
            <label>
              <span className="admin-count" style={{ display: "block", marginBottom: 6 }}>CONFIRM NEW PASSWORD</span>
              <input className="admin-input" style={{ width: "100%" }} name="confirm_password" type="password" autoComplete="new-password" minLength={16} maxLength={128} required placeholder="Repeat password" />
            </label>
            {error === "password_rules" ? <p className="form-error">Use 16–128 characters and make sure both password fields match.</p> : null}
            {error === "password_update" ? <p className="form-error">The password could not be updated. Re-authenticate and try again.</p> : null}
            <div><button className="admin-button primary" type="submit">Change password and revoke sessions</button></div>
          </form>
        </div>
      </section>
    </div>
  );
}
