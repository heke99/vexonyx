import Link from "next/link";
import { getWorkspace } from "@/lib/workspace";
import { purgeProject, restoreDeletedProject } from "../[id]/actions";

export default async function DeletedProjectsPage() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const { data, error } = await ws.supabase.schema("app").from("projects").select("id,name,deleted_at,updated_at").eq("organization_id",ws.organizationId).not("deleted_at","is",null).order("deleted_at",{ascending:false}).limit(100);
  const isAdmin = ws.role === "organization_owner" || ws.role === "organization_admin";

  return <div className="app-content">
    <div className="app-heading"><div><h1>Deleted projects</h1><p>Restore a project or permanently remove it after review.</p></div><Link className="button button-small secondary" href="/app/projects">Back to projects</Link></div>
    <section className="workspace-card"><header><h2>Deleted projects</h2><span>{data?.length ?? 0}</span></header>
      {error ? <div className="empty-state"><div><b>Deleted projects could not be loaded.</b><p>No data was changed.</p></div></div> : data?.length ? data.map((project)=><div className="project-row" key={project.id}><div><b>{project.name}</b><small>Deleted {project.deleted_at ? new Date(project.deleted_at).toLocaleString("en-GB") : "recently"}</small></div>{isAdmin ? <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><form action={restoreDeletedProject}><input type="hidden" name="project_id" value={project.id}/><input type="hidden" name="organization_id" value={ws.organizationId}/><button className="button button-small" type="submit">Restore</button></form><form action={purgeProject} style={{display:"flex",gap:6,alignItems:"center"}}><input type="hidden" name="project_id" value={project.id}/><input type="hidden" name="organization_id" value={ws.organizationId}/><input name="confirmation" required maxLength={160} aria-label={`Type ${project.name} to permanently delete`} placeholder={`Type “${project.name}”`}/><button className="button button-small secondary" type="submit">Delete permanently</button></form></div> : <span>Admin required</span>}</div>) : <div className="empty-state"><div><b>No deleted projects.</b><p>Projects moved here can be restored before permanent deletion.</p></div></div>}
    </section>
  </div>;
}
