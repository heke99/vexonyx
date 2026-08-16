import Link from "next/link";
import { getWorkspace } from "@/lib/workspace";
import { startPreGpuAgentRun } from "./actions";

const terminalStates = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const [runsResult,profilesResult,versionsResult,projectsResult] = await Promise.all([
    ws.supabase.schema("ai").from("agent_runs").select("id,project_id,state,objective,current_step,max_steps,agent_profile_id,agent_profile_version_id,model_selection_mode,requested_model_alias,created_at,updated_at").eq("organization_id", ws.organizationId).order("created_at", { ascending: false }).limit(50),
    ws.supabase.schema("ai").from("agent_profiles").select("id,name,slug,description,category,current_version,enabled").eq("enabled",true).order("name"),
    ws.supabase.schema("ai").from("agent_profile_versions").select("id,agent_profile_id,version,status,max_autonomy,network_access,sandbox_profile,max_steps,max_tool_calls,max_cost"),
    ws.supabase.schema("app").from("projects").select("id,name").eq("organization_id",ws.organizationId).is("deleted_at",null).order("updated_at",{ascending:false}).limit(100),
  ]);
  const data = runsResult.data;
  const error = runsResult.error;
  const profiles = profilesResult.data ?? [];
  const versions = versionsResult.data ?? [];
  const projects = projectsResult.data ?? [];
  const profileMap = new Map(profiles.map((profile)=>[profile.id,profile]));
  const active = data?.filter((run) => !terminalStates.has(run.state)).length ?? 0;
  const completed = data?.filter((run) => run.state === "COMPLETED").length ?? 0;
  const needsAttention = data?.filter((run) => ["FAILED","WAITING_FOR_APPROVAL","WAITING_FOR_USER","PAUSED_BUDGET_LIMIT"].includes(run.state)).length ?? 0;
  const canStart = ws.role !== "viewer" && projects.length > 0;

  return <div className="app-content">
    <div className="app-heading"><div><h1>Agents</h1><p>Start a checkpointed security workflow against one of your projects, then follow each transition, approval and recovery point.</p></div><Link className="button button-small secondary" href="/app/chat">Use an agent in chat</Link></div>
    <section className="metric-grid"><div className="metric"><span>Available profiles</span><strong>{profiles.length}</strong></div><div className="metric"><span>Active runs</span><strong>{active}</strong></div><div className="metric"><span>Completed</span><strong>{completed}</strong></div><div className="metric"><span>Needs attention</span><strong>{needsAttention}</strong></div></section>
    <section className="workspace-grid">
      <article className="workspace-card"><header><h2>Start agent run</h2><span>Pre-GPU · checkpointed</span></header>{canStart ? <form className="auth-form" action={startPreGpuAgentRun} style={{marginTop:16}}><input type="hidden" name="organization_id" value={ws.organizationId}/><label>Project<select name="project_id" required defaultValue=""><option value="" disabled>Select project</option>{projects.map((project)=><option value={project.id} key={project.id}>{project.name}</option>)}</select></label><label>Objective<textarea name="objective" required maxLength={4000} placeholder="Review the authorized project context and prepare a prioritized assessment plan."/></label><label>Approval gate<select name="requires_approval" defaultValue="false"><option value="false">Start safe preview immediately</option><option value="true">Require organization admin approval</option></select></label><button className="button" type="submit">Start run</button><p className="form-note">This phase saves orchestration state only. External execution, tools, sandbox networking and GPU inference remain disabled.</p></form> : <div className="empty-state"><div><b>{projects.length ? "Write access is required." : "Create a project first."}</b><p>Agent runs are always attached to a project and your organization access.</p></div></div>}</article>
      <article className="workspace-card"><header><h2>Agent profiles</h2><span>Choose profiles in Chat</span></header>{profiles.length ? profiles.map((profile)=>{const version=versions.find((item)=>item.agent_profile_id===profile.id && item.version===profile.current_version);return <div className="project-row" key={profile.id}><div><b>{profile.name}</b><small>{profile.description || profile.category} · v{profile.current_version} · {version?.max_autonomy ?? "medium"} autonomy · {version?.network_access ?? "scope_only"} network</small></div><span>{version?.status ?? "internal"}</span></div>;}) : <div className="empty-state"><div><b>No agent profiles are available.</b><p>Superadmin can enable versioned profiles from the AI Control Center.</p></div></div>}</article>
    </section>
    <section className="workspace-card"><header><h2>Recent runs</h2><span>Click a run for steps, checkpoints and approvals</span></header>{error ? <div className="empty-state"><div><b>Agent runs could not be loaded.</b><p>Try again without changing any project data.</p></div></div> : data?.length ? data.map((run) => {const profile=run.agent_profile_id ? profileMap.get(run.agent_profile_id) : null;return <Link className="project-row" href={`/app/agents/${run.id}`} key={run.id}><div><b>{run.objective}</b><small>{profile?.name ?? "VEXONYX default"} · {run.model_selection_mode ?? "auto"}{run.requested_model_alias ? `:${run.requested_model_alias}` : ""} · {run.state.replaceAll("_", " ").toLowerCase()} · step {run.current_step}/{run.max_steps} · {new Date(run.updated_at).toLocaleString("en-GB")}</small></div><span>{terminalStates.has(run.state) ? "Open →" : "Continue →"}</span></Link>;}) : <div className="empty-state"><div><b>No agent runs yet.</b><p>Start one above or use an agent profile in Chat.</p></div></div>}</section>
  </div>;
}
