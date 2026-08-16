import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin/guard";
import { provisionDemoUser } from "../user-preview-actions";

export const dynamic = "force-dynamic";

export default async function AdminDemoPage() {
  const { admin } = await requireSuperadmin();
  const { data: demoProfiles } = await admin.schema("app").from("profiles").select("id,display_name,account_kind").eq("account_kind", "demo").limit(10);
  const demo = demoProfiles?.[0] ?? null;

  return <div className="admin-page">
    <div className="admin-heading"><div className="admin-heading-copy"><div className="admin-eyebrow">VEXONYX / SUPERADMIN</div><h1>Demo user</h1><p>Create or reset the real demo account used to validate the customer dashboard with normal product data and isolation.</p></div><div className="admin-heading-actions"><Link className="admin-button" href="/admin/users">← Users</Link></div></div>
    <section className="admin-grid equal">
      <article className="admin-card"><div className="admin-card-header"><h2>Level 1 · Real test account</h2><span>demo@vexonyx.com</span></div><form className="admin-card-body admin-form" action={provisionDemoUser}><p>The password is used only for Supabase Auth and is never stored in VEXONYX tables. Provisioning resets synthetic projects, chats, agent runs, usage, credits and the demo connector without touching real customers.</p><label>Demo password<input className="admin-input" type="password" name="password" minLength={16} maxLength={128} autoComplete="new-password" required placeholder="At least 16 characters" /></label><button className="admin-button" type="submit">{demo ? "Reset demo account" : "Create demo account"}</button></form></article>
      <article className="admin-card"><div className="admin-card-header"><h2>Level 2 · Superadmin preview</h2><span>15 minute session</span></div><div className="admin-card-body admin-health"><div className="admin-health-row"><span>Mode</span><b>Read-only</b></div><div className="admin-health-row"><span>Session</span><b>Opaque HttpOnly token</b></div><div className="admin-health-row"><span>Target</span><b>Non-admin users only</b></div><div className="admin-health-row"><span>Audit</span><b>Start / stop recorded</b></div>{demo ? <Link className="admin-button" href={`/admin/users/${demo.id}`}>Open demo user →</Link> : <p>Create the demo account first, then use “View as user” from its user record.</p>}</div></article>
    </section>
  </div>;
}
