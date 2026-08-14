import Link from "next/link";
import { getWorkspace } from "@/lib/workspace";

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const { data, error } = await ws.supabase.schema("reports").from("reports").select("id,project_id,title,status,created_at,updated_at").eq("organization_id", ws.organizationId).order("updated_at", { ascending: false }).limit(100);
  const drafts = data?.filter((report) => String(report.status).toLowerCase() === "draft").length ?? 0;
  const ready = data?.filter((report) => ["ready","completed","published"].includes(String(report.status).toLowerCase())).length ?? 0;

  return <div className="app-content">
    <div className="app-heading"><div><h1>Reports</h1><p>Turn validated findings into consistent executive and technical reports without losing their source evidence.</p></div><Link className="button button-small" href="/app/projects">Open projects</Link></div>
    <section className="metric-grid"><div className="metric"><span>Reports</span><strong>{data?.length ?? 0}</strong></div><div className="metric"><span>Drafts</span><strong>{drafts}</strong></div><div className="metric"><span>Ready</span><strong>{ready}</strong></div></section>
    <section className="workspace-card"><header><h2>Report library</h2><span>Versioned project output</span></header>
      {error ? <div className="empty-state"><div><b>Reports could not be loaded.</b><p>Try again. Existing report versions remain unchanged.</p></div></div> : data?.length ? data.map((report) => <Link className="project-row" href={`/app/projects/${report.project_id}`} key={report.id}><div><b>{report.title}</b><small>Updated {new Date(report.updated_at).toLocaleString("en-GB")}</small></div><span>{String(report.status).replaceAll("_", " ")}</span></Link>) : <div className="empty-state"><div><b>No reports yet.</b><p>Create reports from a project after findings and evidence are ready for review.</p></div></div>}
    </section>
  </div>;
}
