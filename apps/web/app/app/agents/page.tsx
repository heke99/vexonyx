import { getWorkspace } from "@/lib/workspace";

const terminalStates = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const [runsResult,profilesResult,versionsResult] = await Promise.all([
    ws.supabase.schema("ai").from("agent_runs").select("id,project_id,state,objective,current_step,max_steps,agent_profile_id,agent_profile_version_id,model_selection_mode,requested_model_alias,created_at,updated_at").eq("organization_id", ws.organizationId).order("created_at", { ascending: false }).limit(50),
    ws.supabase.schema("ai").from("agent_profiles").select("id,name,slug,description,category,current_version,enabled").eq("enabled",true).order("name"),
    ws.supabase.schema("ai").from("agent_profile_versions").select("id,agent_profile_id,version,status,max_autonomy,network_access,sandbox_profile,max_steps,max_tool_calls,max_cost"),
  ]);
  const data = runsResult.data;
  const error = runsResult.error;
  const profiles = profilesResult.data ?? [];
  const versions = versionsResult.data ?? [];
  const profileMap = new Map(profiles.map((profile)=>[profile.id,profile]));
  const active = data?.filter((run) => !terminalStates.has(run.state)).length ?? 0;
  const completed = data?.filter((run) => run.state === "COMPLETED").length ?? 0;
  const needsAttention = data?.filter((run) => ["FAILED","WAITING_FOR_APPROVAL","WAITING_FOR_USER","PAUSED_BUDGET_LIMIT"].includes(run.state)).length ?? 0;

  return <div className="app-content">
    <div className="app-heading"><div><h1>Agents</h1><p>Choose a versioned security profile in chat, then follow each run from objective to completion with approvals, scope and recovery kept outside model control.</p></div></div>
    <section className="metric-grid"><div className="metric"><span>Available profiles</span><strong>{profiles.length}</strong></div><div className="metric"><span>Active runs</span><strong>{active}</strong></div><div className="metric"><span>Completed</span><strong>{completed}</strong></div><div className="metric"><span>Needs attention</span><strong>{needsAttention}</strong></div></section>
    <section className="workspace-card"><header><h2>Agent profiles</h2><span>Versioned configuration</span></header>
      {profiles.length ? profiles.map((profile)=>{const version=versions.find((item)=>item.agent_profile_id===profile.id && item.version===profile.current_version);return <div className="project-row" key={profile.id}><div><b>{profile.name}</b><small>{profile.description || profile.category} · v{profile.current_version} · {version?.max_autonomy ?? "medium"} autonomy · {version?.network_access ?? "scope_only"} network</small></div><span>{version?.status ?? "internal"}</span></div>;}) : <div className="empty-state"><div><b>No agent profiles are available.</b><p>Superadmin can enable versioned profiles from the AI Control Center.</p></div></div>}
    </section>
    <section className="workspace-card"><header><h2>Recent runs</h2><span>External actions remain off until explicitly enabled</span></header>
      {error ? <div className="empty-state"><div><b>Agent runs could not be loaded.</b><p>Try again without changing any project data.</p></div></div> : data?.length ? data.map((run) => {const profile=run.agent_profile_id ? profileMap.get(run.agent_profile_id) : null;return <div className="project-row" key={run.id}><div><b>{run.objective}</b><small>{profile?.name ?? "VEXONYX default"} · {run.model_selection_mode ?? "auto"}{run.requested_model_alias ? `:${run.requested_model_alias}` : ""} · {run.state.replaceAll("_", " ").toLowerCase()} · step {run.current_step}/{run.max_steps} · {new Date(run.updated_at).toLocaleString("en-GB")}</small></div><span>{terminalStates.has(run.state) ? "Finished" : "In progress"}</span></div>;}) : <div className="empty-state"><div><b>No agent runs yet.</b><p>Start from a project once its scope and authorization are ready.</p></div></div>}
    </section>
  </div>;
}
