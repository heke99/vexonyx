import Link from "next/link";
import { createOrganization, createProject } from "./actions";
import { getWorkspace } from "@/lib/workspace";

export default async function DashboardPage() {
  const workspace = await getWorkspace();
  if (!workspace?.organizationId) return <div className="app-content"><div className="app-heading"><div><h1>Create your organization.</h1><p>This becomes the tenant boundary for projects, files, findings and usage.</p></div></div><section className="workspace-card"><form className="workspace-form" action={createOrganization}><input name="name" maxLength={120} required placeholder="Organization name" /><button className="button" type="submit">Create organization</button></form></section></div>;
  const { supabase, organizationId } = workspace;
  const [projects, findings, files, runs, reports, recentProjects] = await Promise.all([
    supabase.schema("app").from("projects").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null),
    supabase.schema("security").from("findings").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null),
    supabase.schema("artifacts").from("files").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null),
    supabase.schema("ai").from("agent_runs").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.schema("reports").from("reports").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.schema("app").from("projects").select("id,name,status,updated_at").eq("organization_id", organizationId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(6),
  ]);
  const metrics = [["Active projects", projects.count ?? 0],["Findings", findings.count ?? 0],["Files", files.count ?? 0],["Agent runs", runs.count ?? 0],["Reports", reports.count ?? 0]] as const;
  return <div className="app-content"><div className="app-heading"><div><h1>Security workspace</h1><p>Live tenant-scoped database state. No synthetic dashboard counters.</p></div><Link className="button button-small" href="/app/chat">New chat</Link></div><section className="metric-grid">{metrics.map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section><section className="workspace-grid"><article className="workspace-card"><header><h2>Recent projects</h2><Link href="/app/projects">View all →</Link></header>{recentProjects.data?.length ? recentProjects.data.map((project)=><div className="project-row" key={project.id}><div><b>{project.name}</b><small>{project.status}</small></div><span>→</span></div>) : <div className="empty-state"><div><b>No projects yet.</b><p>Create the first authorized assessment workspace.</p></div></div>}<form className="workspace-form" action={createProject}><input type="hidden" name="organization_id" value={organizationId}/><input name="name" required maxLength={160} placeholder="New project name"/><button className="button" type="submit">Create</button></form></article><article className="workspace-card"><header><h2>Agent runtime</h2><span>Mock inference</span></header><div className="empty-state"><div><b>Execution stays disabled by default.</b><p>External tools and sandbox egress require control-plane enablement and valid authorization.</p></div></div></article></section></div>;
}
