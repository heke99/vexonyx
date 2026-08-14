import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

function statusClass(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (["verified","active","completed","succeeded","normal","approved","converted"].includes(v)) return "good";
  if (["pending","pending_verification","queued","running","leased","degraded","invited"].includes(v)) return "warn";
  if (["failed","dead_letter","security_lockdown","rejected","cancelled"].includes(v)) return "bad";
  return "neutral";
}

function niceDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default async function AdminPage() {
  const { admin } = await requireSuperadmin();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);

  const [
    waitlistTotal, waitlistVerified, waitlistPending, waitlistInvited, waitlistConverted,
    profiles, organizations, requests24h, runs24h, queuedJobs, failedJobs,
    pendingApprovals, openFindings, reports, systemState, recentWaitlist, recentAudit,
    monthUsage,
  ] = await Promise.all([
    admin.schema("launch").from("waitlist_entries").select("id", { count: "exact", head: true }),
    admin.schema("launch").from("waitlist_entries").select("id", { count: "exact", head: true }).eq("status", "verified"),
    admin.schema("launch").from("waitlist_entries").select("id", { count: "exact", head: true }).eq("status", "pending_verification"),
    admin.schema("launch").from("waitlist_entries").select("id", { count: "exact", head: true }).eq("status", "invited"),
    admin.schema("launch").from("waitlist_entries").select("id", { count: "exact", head: true }).eq("status", "converted"),
    admin.schema("app").from("profiles").select("id", { count: "exact", head: true }),
    admin.schema("app").from("organizations").select("id", { count: "exact", head: true }),
    admin.schema("ai").from("generation_requests").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
    admin.schema("ai").from("agent_runs").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
    admin.schema("operations").from("jobs").select("id", { count: "exact", head: true }).in("status", ["queued","leased","running"]),
    admin.schema("operations").from("jobs").select("id", { count: "exact", head: true }).in("status", ["failed","dead_letter"]),
    admin.schema("security").from("approval_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.schema("security").from("findings").select("id", { count: "exact", head: true }).is("deleted_at", null).not("status", "in", "(remediated,false_positive,duplicate)"),
    admin.schema("reports").from("reports").select("id", { count: "exact", head: true }),
    admin.schema("operations").from("system_state").select("*").eq("singleton", true).maybeSingle(),
    admin.schema("launch").from("waitlist_entries").select("id,email,name,company,source,status,created_at,email_verified_at").order("created_at", { ascending: false }).limit(8),
    admin.schema("audit").from("audit_logs").select("id,actor_type,action,resource_type,created_at").order("created_at", { ascending: false }).limit(8),
    admin.schema("usage").from("usage_monthly").select("organization_id,metric,quantity,cost").gte("month_start", monthStart).limit(5000),
  ]);

  const usageRows = monthUsage.data ?? [];
  const monthCost = usageRows.reduce((sum, row) => sum + Number(row.cost ?? 0), 0);
  const monthQuantity = usageRows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  const waitlistCount = waitlistTotal.count ?? 0;
  const verifiedCount = waitlistVerified.count ?? 0;
  const verificationRate = waitlistCount ? Math.round((verifiedCount / waitlistCount) * 100) : 0;
  const funnel = [
    ["Pending", waitlistPending.count ?? 0],
    ["Verified", verifiedCount],
    ["Invited", waitlistInvited.count ?? 0],
    ["Converted", waitlistConverted.count ?? 0],
  ] as const;
  const funnelMax = Math.max(1, ...funnel.map(([, value]) => value));
  const state = systemState.data as Record<string, unknown> | null;

  const alerts = [
    { label: "Failed background jobs", count: failedJobs.count ?? 0, href: "/admin/jobs", bad: true, note: "Jobs requiring operator review or retry." },
    { label: "Pending approvals", count: pendingApprovals.count ?? 0, href: "/admin/security", bad: false, note: "Human review gates waiting for a decision." },
    { label: "Open findings", count: openFindings.count ?? 0, href: "/admin/findings", bad: false, note: "Security findings not yet closed." },
  ];

  return (
    <div className="admin-page">
      <div className="admin-heading">
        <div className="admin-heading-copy">
          <div className="admin-eyebrow">VEXONYX / SUPERADMIN</div>
          <h1>Command center</h1>
          <p>Growth, customers, product activity, security operations and platform health in one protected workspace.</p>
        </div>
        <div className="admin-heading-actions">
          <Link className="admin-button" href="/admin/audit">Review audit log</Link>
          <Link className="admin-button primary" href="/admin/waitlist">Manage waitlist</Link>
        </div>
      </div>

      <section className="admin-metrics" aria-label="Platform metrics">
        <div className="admin-metric"><div className="admin-metric-label"><span>Waitlist</span><span>Growth</span></div><strong>{waitlistCount.toLocaleString()}</strong><small className="good">{verificationRate}% email verified</small></div>
        <div className="admin-metric"><div className="admin-metric-label"><span>Users</span><span>Accounts</span></div><strong>{(profiles.count ?? 0).toLocaleString()}</strong><small>{(organizations.count ?? 0).toLocaleString()} organizations</small></div>
        <div className="admin-metric"><div className="admin-metric-label"><span>AI requests</span><span>24 hours</span></div><strong>{(requests24h.count ?? 0).toLocaleString()}</strong><small>{(runs24h.count ?? 0).toLocaleString()} agent runs</small></div>
        <div className="admin-metric"><div className="admin-metric-label"><span>Usage cost</span><span>This month</span></div><strong>${monthCost.toFixed(2)}</strong><small>{monthQuantity.toLocaleString()} tracked units</small></div>
        <div className="admin-metric"><div className="admin-metric-label"><span>Jobs active</span><span>Queues</span></div><strong>{(queuedJobs.count ?? 0).toLocaleString()}</strong><small className={(failedJobs.count ?? 0) ? "bad" : "good"}>{failedJobs.count ?? 0} failed / dead-letter</small></div>
        <div className="admin-metric"><div className="admin-metric-label"><span>Findings</span><span>Open</span></div><strong>{(openFindings.count ?? 0).toLocaleString()}</strong><small>{reports.count ?? 0} reports</small></div>
        <div className="admin-metric"><div className="admin-metric-label"><span>Approvals</span><span>Pending</span></div><strong>{(pendingApprovals.count ?? 0).toLocaleString()}</strong><small>Protected human decisions</small></div>
        <div className="admin-metric"><div className="admin-metric-label"><span>Platform mode</span><span>Safety</span></div><strong style={{fontSize:18}}>{String(state?.incident_mode ?? "unavailable").replaceAll("_", " ")}</strong><small className={state?.incident_mode === "normal" ? "good" : "warn"}>Fail-closed controls visible below</small></div>
      </section>

      <section className="admin-grid">
        <article className="admin-card">
          <div className="admin-card-header"><h2>Recent waitlist signups</h2><Link href="/admin/waitlist">View all →</Link></div>
          {(recentWaitlist.data ?? []).length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Person</th><th>Company</th><th>Source</th><th>Status</th><th>Joined</th></tr></thead><tbody>
            {(recentWaitlist.data ?? []).map((row) => <tr key={row.id}><td><b>{row.name || row.email}</b><small>{row.email}</small></td><td>{row.company || "—"}</td><td>{String(row.source ?? "—").replaceAll("_", " ")}</td><td><span className={`admin-status ${statusClass(row.status)}`}>{String(row.status).replaceAll("_", " ")}</span></td><td>{niceDate(row.created_at)}</td></tr>)}
          </tbody></table></div> : <div className="admin-empty"><b>No signups yet</b>New waitlist entries will appear here immediately.</div>}
        </article>
        <article className="admin-card">
          <div className="admin-card-header"><h2>Waitlist funnel</h2><span>{waitlistCount} total</span></div>
          <div className="admin-card-body admin-funnel">{funnel.map(([label, value]) => <div className="admin-funnel-row" key={label}><label>{label}</label><div className="admin-funnel-track"><div className="admin-funnel-fill" style={{width:`${Math.max(2,(value/funnelMax)*100)}%`}} /></div><strong>{value}</strong></div>)}</div>
        </article>
      </section>

      <section className="admin-grid equal">
        <article className="admin-card">
          <div className="admin-card-header"><h2>Attention required</h2><span>Live</span></div>
          <div className="admin-card-body admin-alerts">{alerts.map((alert) => <Link href={alert.href} className={`admin-alert ${alert.bad && alert.count ? "bad" : ""}`} key={alert.label}><div><b>{alert.label}</b><p>{alert.note}</p></div><strong>{alert.count}</strong></Link>)}</div>
        </article>
        <article className="admin-card">
          <div className="admin-card-header"><h2>Safety state</h2><Link href="/admin/platform">Manage →</Link></div>
          <div className="admin-card-body admin-health">
            <div className="admin-health-row"><span>Incident mode</span><span className={`admin-status ${statusClass(String(state?.incident_mode))}`}>{String(state?.incident_mode ?? "unknown").replaceAll("_", " ")}</span></div>
            <div className="admin-health-row"><span>Agents</span><b>{state?.agents_enabled ? "Enabled" : "Disabled"}</b></div>
            <div className="admin-health-row"><span>External actions</span><b>{state?.external_tools_enabled ? "Enabled" : "Disabled"}</b></div>
            <div className="admin-health-row"><span>Sandbox scheduling</span><b>{state?.sandbox_scheduling_enabled ? "Enabled" : "Disabled"}</b></div>
            <div className="admin-health-row"><span>External network</span><b>{state?.external_network_enabled ? "Enabled" : "Disabled"}</b></div>
          </div>
        </article>
      </section>

      <section className="admin-card">
        <div className="admin-card-header"><h2>Recent privileged activity</h2><Link href="/admin/audit">Full audit log →</Link></div>
        {(recentAudit.data ?? []).length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Action</th><th>Actor</th><th>Resource</th><th>Time</th></tr></thead><tbody>
          {(recentAudit.data ?? []).map((row) => <tr key={row.id}><td><b>{String(row.action).replaceAll("_", " ")}</b></td><td>{row.actor_type}</td><td>{String(row.resource_type ?? "—").replaceAll("_", " ")}</td><td>{niceDate(row.created_at)}</td></tr>)}
        </tbody></table></div> : <div className="admin-empty"><b>No privileged activity yet</b>Administrative actions will be recorded here.</div>}
      </section>
    </div>
  );
}
