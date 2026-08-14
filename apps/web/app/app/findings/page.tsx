import Link from "next/link";
import { getWorkspace } from "@/lib/workspace";

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const { data, error } = await ws.supabase.schema("security").from("findings").select("id,project_id,title,severity,confidence,status,affected_asset,updated_at").eq("organization_id", ws.organizationId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(100);
  const high = data?.filter((finding) => ["critical","high"].includes(String(finding.severity).toLowerCase())).length ?? 0;
  const validated = data?.filter((finding) => ["validated","reported","remediated","verified"].includes(String(finding.status).toLowerCase())).length ?? 0;
  const reviewing = data?.filter((finding) => ["potential","reviewing"].includes(String(finding.status).toLowerCase())).length ?? 0;

  return <div className="app-content">
    <div className="app-heading"><div><h1>Findings</h1><p>Review potential issues, confidence and affected assets while keeping the evidence trail attached.</p></div><Link className="button button-small" href="/app/projects">Open projects</Link></div>
    <section className="metric-grid"><div className="metric"><span>Critical / high</span><strong>{high}</strong></div><div className="metric"><span>Under review</span><strong>{reviewing}</strong></div><div className="metric"><span>Validated+</span><strong>{validated}</strong></div></section>
    <section className="workspace-card"><header><h2>All findings</h2><span>{data?.length ?? 0} total</span></header>
      {error ? <div className="empty-state"><div><b>Findings could not be loaded.</b><p>Try again. Existing review states remain unchanged.</p></div></div> : data?.length ? data.map((finding) => <Link className="project-row" href={`/app/projects/${finding.project_id}`} key={finding.id}><div><b>{finding.title}</b><small>{String(finding.severity).toUpperCase()} · {finding.affected_asset || "Asset not specified"} · {finding.confidence == null ? "confidence pending" : `${Math.round(Number(finding.confidence) * (Number(finding.confidence) <= 1 ? 100 : 1))}% confidence`}</small></div><span>{String(finding.status).replaceAll("_", " ")}</span></Link>) : <div className="empty-state"><div><b>No findings yet.</b><p>Potential findings will appear here as authorized assessments produce evidence for review.</p></div></div>}
    </section>
  </div>;
}
