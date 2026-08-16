import Link from "next/link";
import { getWorkspace } from "@/lib/workspace";

type ActivityItem = { id:string; label:string; title:string; detail:string; at:string; href?:string };

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const [projects, files, findings, runs] = await Promise.all([
    ws.supabase.schema("app").from("projects").select("id,name,status,updated_at").eq("organization_id", ws.organizationId).is("deleted_at", null).order("updated_at", { ascending:false }).limit(20),
    ws.supabase.schema("artifacts").from("files").select("id,project_id,original_name,status,updated_at").eq("organization_id", ws.organizationId).is("deleted_at", null).order("updated_at", { ascending:false }).limit(20),
    ws.supabase.schema("security").from("findings").select("id,project_id,title,status,severity,updated_at").eq("organization_id", ws.organizationId).is("deleted_at", null).order("updated_at", { ascending:false }).limit(20),
    ws.supabase.schema("ai").from("agent_runs").select("id,project_id,objective,state,updated_at").eq("organization_id", ws.organizationId).order("updated_at", { ascending:false }).limit(20),
  ]);

  const events: ActivityItem[] = [
    ...(projects.data ?? []).map((item) => ({ id:`project-${item.id}`, label:"PROJECT", title:item.name, detail:String(item.status).replaceAll("_", " "), at:item.updated_at, href:`/app/projects/${item.id}` })),
    ...(files.data ?? []).map((item) => ({ id:`file-${item.id}`, label:"FILE", title:item.original_name, detail:String(item.status).replaceAll("_", " "), at:item.updated_at, href:item.project_id ? `/app/projects/${item.project_id}` : "/app/files" })),
    ...(findings.data ?? []).map((item) => ({ id:`finding-${item.id}`, label:"FINDING", title:item.title, detail:`${String(item.severity).toUpperCase()} · ${String(item.status).replaceAll("_", " ")}`, at:item.updated_at, href:`/app/findings/${item.id}` })),
    ...(runs.data ?? []).map((item) => ({ id:`run-${item.id}`, label:"AGENT", title:item.objective, detail:String(item.state).replaceAll("_", " ").toLowerCase(), at:item.updated_at, href:`/app/agents/${item.id}` })),
  ].sort((a,b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0,50);

  const hasError = Boolean(projects.error && files.error && findings.error && runs.error);

  return <div className="app-content">
    <div className="app-heading"><div><h1>Activity</h1><p>A single timeline for project changes, files, findings and agent progress.</p></div></div>
    <section className="workspace-card"><header><h2>Recent activity</h2><span>{events.length} updates</span></header>{hasError ? <div className="empty-state"><div><b>Activity could not be loaded.</b><p>Try again. No workspace data has been changed.</p></div></div> : events.length ? events.map((event) => <Link className="project-row" href={event.href ?? "/app"} key={event.id}><div><small>{event.label}</small><b>{event.title}</b><small>{event.detail} · {new Date(event.at).toLocaleString("en-GB")}</small></div><span>Open →</span></Link>) : <div className="empty-state"><div><b>No activity yet.</b><p>Project, file, finding and agent updates will appear here as work begins.</p></div></div>}</section>
  </div>;
}
