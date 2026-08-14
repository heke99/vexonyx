import { getWorkspace } from "@/lib/workspace";

function budget(value: unknown) {
  return value == null ? "Not set" : Number(value).toFixed(2);
}

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const [organization, quotas] = await Promise.all([
    ws.supabase.schema("app").from("organizations").select("id,name,slug,status,created_at,updated_at").eq("id", ws.organizationId).maybeSingle(),
    ws.supabase.schema("billing").from("quotas").select("monthly_budget,agent_budget,generation_budget,sandbox_budget,hard_cap_enabled,updated_at").eq("organization_id", ws.organizationId).maybeSingle(),
  ]);

  return <div className="app-content">
    <div className="app-heading"><div><h1>Settings</h1><p>Organization access, safety limits and data controls in one place.</p></div></div>
    <section className="workspace-grid">
      <article className="workspace-card"><header><h2>Organization</h2><span>{ws.role?.replaceAll("organization_", "").replaceAll("_", " ")}</span></header>
        {organization.error ? <div className="empty-state"><b>Organization details could not be loaded.</b></div> : <><div className="project-row"><div><b>Name</b><small>Shown across the workspace</small></div><span>{organization.data?.name ?? "—"}</span></div><div className="project-row"><div><b>Status</b><small>Current organization access state</small></div><span>{organization.data?.status ?? "—"}</span></div><div className="project-row"><div><b>Workspace ID</b><small>Stable reference for support and API use</small></div><span>{organization.data?.slug ?? "—"}</span></div></>}
      </article>
      <article className="workspace-card"><header><h2>Safety budgets</h2><span>{quotas.data?.hard_cap_enabled ? "Hard caps enabled" : "Hard caps not enabled"}</span></header>
        <div className="project-row"><div><b>Monthly budget</b><small>Maximum tracked spend for the organization</small></div><span>{budget(quotas.data?.monthly_budget)}</span></div>
        <div className="project-row"><div><b>Agent run budget</b><small>Limit applied to a single agent run</small></div><span>{budget(quotas.data?.agent_budget)}</span></div>
        <div className="project-row"><div><b>AI generation budget</b><small>Limit for a single generation</small></div><span>{budget(quotas.data?.generation_budget)}</span></div>
        <div className="project-row"><div><b>External execution budget</b><small>Limit for future isolated execution</small></div><span>{budget(quotas.data?.sandbox_budget)}</span></div>
      </article>
    </section>
    <section className="workspace-card"><header><h2>Data controls</h2><span>Private beta</span></header><div className="empty-state"><div><b>Export, deletion and retention controls are prepared for beta rollout.</b><p>Project files and sensitive evidence remain private by default. Destructive account-level actions are not exposed until the recovery path is fully verified.</p></div></div></section>
  </div>;
}
