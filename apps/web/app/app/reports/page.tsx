import Link from "next/link";
import { getWorkspace } from "@/lib/workspace";
import { requestReportRender } from "./actions";

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const [reports,renders] = await Promise.all([
    ws.supabase.schema("reports").from("reports").select("id,project_id,title,status,created_at,updated_at").eq("organization_id", ws.organizationId).order("updated_at", { ascending: false }).limit(100),
    ws.supabase.schema("reports").from("render_jobs").select("id,report_id,format,status,sha256,created_at,completed_at").eq("organization_id",ws.organizationId).order("created_at",{ascending:false}).limit(100)
  ]);
  const data=reports.data; const error=reports.error; const drafts = data?.filter((report) => String(report.status).toLowerCase() === "draft").length ?? 0; const ready = data?.filter((report) => String(report.status).toLowerCase() === "ready").length ?? 0;

  return <div className="app-content">
    <div className="app-heading"><div><h1>Reports</h1><p>Turn validated findings into versioned executive and technical reports. PDF and DOCX exports render from an immutable report snapshot.</p></div><Link className="button button-small" href="/app/projects">Open projects</Link></div>
    <section className="metric-grid"><div className="metric"><span>Reports</span><strong>{data?.length ?? 0}</strong></div><div className="metric"><span>Drafts</span><strong>{drafts}</strong></div><div className="metric"><span>Ready</span><strong>{ready}</strong></div><div className="metric"><span>Exports</span><strong>{renders.data?.length??0}</strong></div></section>
    <section className="workspace-card"><header><h2>Report library</h2><span>Versioned project output</span></header>
      {error ? <div className="empty-state"><div><b>Reports could not be loaded.</b><p>Try again. Existing report versions remain unchanged.</p></div></div> : data?.length ? data.map((report) => {const latest=(renders.data??[]).find(r=>r.report_id===report.id);return <div className="project-row" key={report.id}><Link href={`/app/reports/${report.id}`}><div><b>{report.title}</b><small>Updated {new Date(report.updated_at).toLocaleString("en-GB")}{latest?` · latest ${latest.format} ${latest.status}`:""}</small></div></Link><div style={{display:"flex",gap:8,alignItems:"center"}}>{latest?.status==="ready"?<a className="button button-small secondary" href={`/api/v1/reports/render/${latest.id}/download`}>Download {latest.format.toUpperCase()}</a>:null}<form action={requestReportRender}><input type="hidden" name="report_id" value={report.id}/><input type="hidden" name="format" value="pdf"/><button className="button button-small secondary" type="submit">PDF</button></form><form action={requestReportRender}><input type="hidden" name="report_id" value={report.id}/><input type="hidden" name="format" value="docx"/><button className="button button-small secondary" type="submit">DOCX</button></form></div></div>}) : <div className="empty-state"><div><b>No reports yet.</b><p>Create reports from a project after findings and evidence are ready for review.</p></div></div>}
    </section>
  </div>;
}
