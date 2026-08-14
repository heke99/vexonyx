import Link from "next/link";
import { createProject } from "../actions";
import { getWorkspace } from "@/lib/workspace";

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;
  const { data, error } = await ws.supabase.schema("app").from("projects").select("id,name,status,updated_at").eq("organization_id", ws.organizationId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(50);

  return <div className="app-content">
    <div className="app-heading"><div><h1>Projects</h1><p>Authorized security workspaces with scope, files, notes, findings, evidence and reports kept together.</p></div></div>
    <section className="workspace-card">
      {error ? <div className="empty-state"><div><b>Projects could not be loaded.</b><p>Try again. Your existing project data has not been changed.</p></div></div> : data?.length ? data.map(project => <Link className="project-row" href={`/app/projects/${project.id}`} key={project.id}><div><b>{project.name}</b><small>{project.status} · {new Date(project.updated_at).toLocaleDateString("en-GB")}</small></div><span>Open →</span></Link>) : <div className="empty-state"><div><b>No projects yet.</b><p>Create the first authorized assessment for your organization.</p></div></div>}
      <form className="workspace-form" action={createProject}><input type="hidden" name="organization_id" value={ws.organizationId}/><input name="name" required maxLength={160} placeholder="Project name"/><button className="button" type="submit">Create project</button></form>
    </section>
  </div>;
}
