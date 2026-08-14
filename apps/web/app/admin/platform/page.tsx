import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin/guard";
import { setIncidentMode } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminPlatformPage() {
  const { admin } = await requireSuperadmin();
  const [stateResult, models, deployments] = await Promise.all([
    admin.schema("operations").from("system_state").select("*").eq("singleton", true).maybeSingle(),
    admin.schema("ai").from("models").select("id", { count: "exact", head: true }).eq("enabled", true),
    admin.schema("ai").from("model_deployments").select("id", { count: "exact", head: true }).neq("status", "disabled"),
  ]);
  if (stateResult.error) throw stateResult.error;
  const state = stateResult.data as Record<string, unknown> | null;

  const environment = [
    ["Supabase public URL", Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)],
    ["Supabase publishable key", Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)],
    ["Supabase privileged key", Boolean(process.env.SUPABASE_SECRET_KEY)],
    ["Resend API", Boolean(process.env.RESEND_API_KEY)],
    ["Transactional sender", Boolean(process.env.TRANSACTIONAL_FROM_EMAIL || process.env.WAITLIST_FROM_EMAIL)],
  ] as const;

  return (
    <div className="admin-page">
      <div className="admin-heading">
        <div className="admin-heading-copy"><div className="admin-eyebrow">VEXONYX / SUPERADMIN / OPERATIONS</div><h1>Platform</h1><p>Emergency mode, fail-closed execution controls and non-secret production configuration health.</p></div>
        <div className="admin-heading-actions"><Link className="admin-button" href="/admin/audit">Audit changes</Link></div>
      </div>

      <section className="admin-metrics">
        <div className="admin-metric"><div className="admin-metric-label"><span>Incident mode</span><span>Global</span></div><strong style={{fontSize:18}}>{String(state?.incident_mode ?? "unknown").replaceAll("_", " ")}</strong><small>Controls emergency behavior</small></div>
        <div className="admin-metric"><div className="admin-metric-label"><span>Enabled models</span><span>AI</span></div><strong>{models.count ?? 0}</strong><small>{(models.count ?? 0) === 0 ? "Pre-GPU safe state" : "Review before production use"}</small></div>
        <div className="admin-metric"><div className="admin-metric-label"><span>Deployments</span><span>GPU</span></div><strong>{deployments.count ?? 0}</strong><small>Non-disabled deployments</small></div>
        <div className="admin-metric"><div className="admin-metric-label"><span>Waitlist mode</span><span>Access</span></div><strong style={{fontSize:18}}>Enabled</strong><small className="good">Public account access closed</small></div>
      </section>

      <section className="admin-grid equal">
        <article className="admin-card">
          <div className="admin-card-header"><h2>Incident mode</h2><span>Audited change</span></div>
          <div className="admin-card-body">
            <p className="admin-note">Security lockdown also forces agents, external actions, sandbox scheduling and external network access off. Re-enabling those execution paths is deliberately not exposed as a one-click admin action before their production gates are complete.</p>
            <div className="admin-divider" />
            <form className="admin-form-inline" action={setIncidentMode}>
              <select className="admin-select" name="mode" defaultValue={String(state?.incident_mode ?? "normal")}>
                <option value="normal">normal</option><option value="degraded">degraded</option><option value="maintenance">maintenance</option><option value="security_lockdown">security lockdown</option>
              </select>
              <button className="admin-button primary" type="submit">Apply mode</button>
            </form>
          </div>
        </article>

        <article className="admin-card">
          <div className="admin-card-header"><h2>Execution safety</h2><span>Live database state</span></div>
          <div className="admin-card-body admin-health">
            <div className="admin-health-row"><span>Agents</span><span className={`admin-status ${state?.agents_enabled ? "warn" : "good"}`}>{state?.agents_enabled ? "enabled" : "disabled"}</span></div>
            <div className="admin-health-row"><span>External actions</span><span className={`admin-status ${state?.external_tools_enabled ? "bad" : "good"}`}>{state?.external_tools_enabled ? "enabled" : "disabled"}</span></div>
            <div className="admin-health-row"><span>Sandbox scheduling</span><span className={`admin-status ${state?.sandbox_scheduling_enabled ? "warn" : "good"}`}>{state?.sandbox_scheduling_enabled ? "enabled" : "disabled"}</span></div>
            <div className="admin-health-row"><span>External network</span><span className={`admin-status ${state?.external_network_enabled ? "bad" : "good"}`}>{state?.external_network_enabled ? "enabled" : "disabled"}</span></div>
          </div>
        </article>
      </section>

      <section className="admin-card">
        <div className="admin-card-header"><h2>Production environment</h2><span>Presence only — secrets are never displayed</span></div>
        <div className="admin-card-body admin-health">{environment.map(([label, configured]) => <div className="admin-health-row" key={label}><span>{label}</span><span className={`admin-status ${configured ? "good" : "bad"}`}>{configured ? "configured" : "missing"}</span></div>)}</div>
      </section>
    </div>
  );
}
