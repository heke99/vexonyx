import { AppSidebar } from "@/components/app-sidebar";
import { requireUserPreview } from "@/lib/admin/impersonation";
import { stopUserPreview } from "../../../user-preview-actions";

export const dynamic = "force-dynamic";

export default async function UserPreviewPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const preview = await requireUserPreview(userId);
  const { admin, organizationId, targetUserId } = preview;
  const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0); const monthStart = month.toISOString().slice(0, 10);

  const [projects, findings, files, runs, reports, recentProjects, recentChats, subscription, credits, usage, integrations] = await Promise.all([
    admin.schema("app").from("projects").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null),
    admin.schema("security").from("findings").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null),
    admin.schema("artifacts").from("files").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null),
    admin.schema("ai").from("agent_runs").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
    admin.schema("reports").from("reports").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
    admin.schema("app").from("projects").select("id,name,status,updated_at").eq("organization_id", organizationId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(5),
    admin.schema("app").from("conversations").select("id,title,status,updated_at").eq("organization_id", organizationId).eq("user_id", targetUserId).neq("status", "deleted").order("updated_at", { ascending: false }).limit(5),
    admin.schema("billing").from("subscriptions").select("status,current_period_end,plan_id,plans(name,code)").eq("organization_id", organizationId).maybeSingle(),
    admin.schema("billing").from("credit_accounts").select("balance,lifetime_consumed").eq("organization_id", organizationId).maybeSingle(),
    admin.schema("usage").from("usage_monthly").select("metric,quantity,cost").eq("organization_id", organizationId).eq("month_start", monthStart),
    admin.schema("integrations").from("installations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "connected"),
  ]);

  const sub = subscription.data as Record<string, unknown> | null;
  const plan = sub?.plans && typeof sub.plans === "object" ? sub.plans as Record<string, unknown> : null;
  const monthlyCost = (usage.data ?? []).reduce((sum, item) => sum + Number(item.cost ?? 0), 0);
  const metrics = [["Projects", projects.count ?? 0], ["Findings", findings.count ?? 0], ["Files", files.count ?? 0], ["Agent runs", runs.count ?? 0], ["Reports", reports.count ?? 0], ["Credits", Number(credits.data?.balance ?? 0)], ["Usage cost", `$${monthlyCost.toFixed(2)}`], ["Connectors", integrations.count ?? 0]] as const;

  return <div style={{ minHeight: "100vh", background: "var(--background)" }}>
    <div style={{ position: "sticky", top: 0, zIndex: 100, padding: "10px 18px", background: "#fff4cc", color: "#4b3b00", borderBottom: "1px solid #e8cf72", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
      <div><b>Viewing as {preview.targetDisplayName || preview.targetEmail}</b> · Read-only preview · Expires {new Date(preview.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
      <form action={stopUserPreview}><input type="hidden" name="user_id" value={targetUserId} /><button className="admin-button" type="submit">Exit preview</button></form>
    </div>
    <div className="app-shell">
      <div style={{ pointerEvents: "none", userSelect: "none" }}><AppSidebar /></div>
      <main className="app-main">
        <header className="app-topbar"><span>Authorized security workspace</span><span>SUPERADMIN PREVIEW · external actions disabled</span></header>
        <div className="app-content">
          <div className="app-heading"><div><h1>Security workspace</h1><p>Chats, projects, agents, evidence, billing, usage and integrations stay attached to the same organization and account history.</p></div><div style={{ display: "flex", gap: 10 }}><span className="button button-small secondary">{String(plan?.name || "Choose plan")}</span><span className="button button-small" aria-disabled="true">New chat</span></div></div>
          <section className="metric-grid">{metrics.map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong>{typeof value === "number" ? value.toLocaleString() : value}</strong></div>)}</section>
          <section className="workspace-grid">
            <article className="workspace-card"><header><h2>Recent chats</h2><span>View all →</span></header>{recentChats.data?.length ? recentChats.data.map((chat) => <div className="project-row" key={chat.id}><div><b>{chat.title}</b><small>{chat.status} · {new Date(chat.updated_at).toLocaleString("en-GB")}</small></div><span>Open →</span></div>) : <div className="empty-state"><div><b>No chats yet.</b><p>Start a persistent VEXONYX conversation.</p></div></div>}</article>
            <article className="workspace-card"><header><h2>Recent projects</h2><span>View all →</span></header>{recentProjects.data?.length ? recentProjects.data.map((project) => <div className="project-row" key={project.id}><div><b>{project.name}</b><small>{project.status}</small></div><span>Open →</span></div>) : <div className="empty-state"><div><b>No projects yet.</b><p>Create your first authorized assessment.</p></div></div>}<div className="workspace-form"><input disabled placeholder="New project name" /><button className="button" disabled type="button">Create</button></div></article>
          </section>
          <section className="workspace-grid"><article className="workspace-card"><header><h2>Account</h2><span>Manage →</span></header><div className="project-row"><div><b>Plan</b><small>{String(sub?.status || "inactive")}</small></div><span>{String(plan?.name || "No paid plan")}</span></div><div className="project-row"><div><b>Credit balance</b><small>{Number(credits.data?.lifetime_consumed ?? 0).toLocaleString()} consumed lifetime</small></div><span>{Number(credits.data?.balance ?? 0).toLocaleString()}</span></div><div className="project-row"><div><b>Connected integrations</b><small>Organization-scoped</small></div><span>{integrations.count ?? 0}</span></div></article><article className="workspace-card"><header><h2>Runtime status</h2><span>Agents →</span></header><div className="empty-state"><div><b>Product workspace ready; external execution remains gated.</b><p>Chats, billing, credits, usage, connectors, authorization and agent state are wired before real GPU/model execution is enabled.</p></div></div></article></section>
        </div>
      </main>
    </div>
  </div>;
}
