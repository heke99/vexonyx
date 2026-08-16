import Link from "next/link";
import { FileLibraryUploader } from "@/components/file-library-uploader";
import { getWorkspace } from "@/lib/workspace";

function formatBytes(value: number | string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const [filesResult,projectsResult] = await Promise.all([
    ws.supabase.schema("artifacts").from("files").select("id,project_id,original_name,size_bytes,status,classification,created_at,updated_at").eq("organization_id", ws.organizationId).is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
    ws.supabase.schema("app").from("projects").select("id,name").eq("organization_id",ws.organizationId).is("deleted_at",null).order("updated_at",{ascending:false}).limit(100),
  ]);
  const data=filesResult.data;const error=filesResult.error;const projects=projectsResult.data??[];
  const ready = data?.filter((file) => file.status === "ready").length ?? 0;
  const reviewing = data?.filter((file) => ["quarantined","scanning","processing","safe_for_processing"].includes(file.status)).length ?? 0;
  const blocked = data?.filter((file) => file.status === "blocked" || file.status === "failed").length ?? 0;

  return <div className="app-content">
    <div className="app-heading"><div><h1>Files</h1><p>Upload project files directly here. Every upload uses a signed storage ticket and is isolated for checks before AI processing.</p></div><Link className="button button-small secondary" href="/app/projects">Manage projects</Link></div>
    <section className="metric-grid"><div className="metric"><span>Ready</span><strong>{ready}</strong></div><div className="metric"><span>Being checked</span><strong>{reviewing}</strong></div><div className="metric"><span>Blocked / failed</span><strong>{blocked}</strong></div></section>
    <section className="workspace-card"><header><h2>Upload file</h2><span>100 MB max · project required</span></header><FileLibraryUploader organizationId={ws.organizationId} projects={projects}/></section>
    <section className="workspace-card"><header><h2>File library</h2><span>{data?.length ?? 0} files</span></header>{error ? <div className="empty-state"><div><b>Files could not be loaded.</b><p>Try again. Existing files remain unchanged.</p></div></div> : data?.length ? data.map((file) => <Link className="project-row" href={file.project_id?`/app/projects/${file.project_id}`:"/app/files"} key={file.id}><div><b>{file.original_name}</b><small>{formatBytes(file.size_bytes)} · {String(file.classification).replaceAll("_", " ")} · {new Date(file.created_at).toLocaleDateString("en-GB")}</small></div><span>{String(file.status).replaceAll("_", " ")} →</span></Link>) : <div className="empty-state"><div><b>No files yet.</b><p>Choose a project above and upload the first assessment file.</p></div></div>}</section>
  </div>;
}
