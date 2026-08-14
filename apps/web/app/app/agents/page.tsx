import { getWorkspace } from "@/lib/workspace";

const terminalStates = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const { data, error } = await ws.supabase.schema("ai").from("agent_runs").select("id,project_id,state,objective,current_step,max_steps,created_at,updated_at").eq("organization_id", ws.organizationId).order("created_at", { ascending: false }).limit(50);
  const active = data?.filter((run) => !terminalStates.has(run.state)).length ?? 0;
  const completed = data?.filter((run) => run.state === "COMPLETED").length ?? 0;
  const needsAttention = data?.filter((run) => ["FAILED","WAITING_FOR_APPROVAL","WAITING_FOR_USER","PAUSED_BUDGET_LIMIT"].includes(run.state)).length ?? 0;

  return <div className="app-content">
    <div className="app-heading"><div><h1>Agents</h1><p>Follow each run from objective to completion, including approvals, progress and recovery.</p></div></div>
    <section className="metric-grid"><div className="metric"><span>Active</span><strong>{active}</strong></div><div className="metric"><span>Completed</span><strong>{completed}</strong></div><div className="metric"><span>Needs attention</span><strong>{needsAttention}</strong></div></section>
    <section className="workspace-card"><header><h2>Recent runs</h2><span>External actions remain off until explicitly enabled</span></header>
      {error ? <div className="empty-state"><div><b>Agent runs could not be loaded.</b><p>Try again without changing any project data.</p></div></div> : data?.length ? data.map((run) => <div className="project-row" key={run.id}><div><b>{run.objective}</b><small>{run.state.replaceAll("_", " ").toLowerCase()} · step {run.current_step}/{run.max_steps} · {new Date(run.updated_at).toLocaleString("en-GB")}</small></div><span>{terminalStates.has(run.state) ? "Finished" : "In progress"}</span></div>) : <div className="empty-state"><div><b>No agent runs yet.</b><p>Start from a project once its scope and authorization are ready.</p></div></div>}
    </section>
  </div>;
}
