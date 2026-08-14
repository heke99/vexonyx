import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { advancePreGpuAgentRun, reviewAgentApproval } from "../actions";

const terminalStates=new Set(["COMPLETED","FAILED","CANCELLED"]);

export default async function AgentRunPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const ws=await getWorkspace();if(!ws?.organizationId)notFound();
  const {data:run}=await ws.supabase.schema("ai").from("agent_runs").select("id,project_id,user_id,objective,state,current_step,max_steps,max_duration_seconds,max_tokens,max_tool_calls,max_cost,total_tokens,total_tool_calls,total_cost,model_alias,router_version,started_at,completed_at,created_at,updated_at").eq("id",id).eq("organization_id",ws.organizationId).maybeSingle();
  if(!run)notFound();
  const isAdmin=ws.role==="organization_owner"||ws.role==="organization_admin";
  const [{data:project},{data:steps},{data:checkpoints},{data:approvals}]=await Promise.all([
    ws.supabase.schema("app").from("projects").select("id,name").eq("id",run.project_id).eq("organization_id",ws.organizationId).maybeSingle(),
    ws.supabase.schema("ai").from("agent_run_steps").select("id,step_number,state,execution_status,action,observation,usage,budget,created_at,completed_at").eq("agent_run_id",id).eq("organization_id",ws.organizationId).order("step_number",{ascending:true}),
    ws.supabase.schema("ai").from("agent_checkpoints").select("id,step_number,current_state,next_action,observation,usage,budget,created_at").eq("agent_run_id",id).eq("organization_id",ws.organizationId).order("step_number",{ascending:false}).limit(20),
    ws.supabase.schema("security").from("approval_requests").select("id,operation_type,status,requested_at,reviewed_at,expires_at,reason").eq("agent_run_id",id).eq("organization_id",ws.organizationId).order("requested_at",{ascending:false}),
  ]);
  const pending=approvals?.find((approval)=>approval.status==="pending");const canAdvance=!terminalStates.has(run.state)&&run.state!=="WAITING_FOR_APPROVAL";
  return <div className="app-content">
    <div className="app-heading"><div><div className="section-label">AGENT RUN / {run.state}</div><h1>{run.objective}</h1><p>{project?.name??"Project"} · state is stored after every transition.</p></div><Link className="button button-small secondary" href="/app/agents">All runs →</Link></div>
    <section className="metric-grid"><div className="metric"><span>STEP</span><strong>{run.current_step}/{run.max_steps}</strong></div><div className="metric"><span>TOKENS</span><strong>{run.total_tokens}</strong></div><div className="metric"><span>TOOLS</span><strong>{run.total_tool_calls}</strong></div><div className="metric"><span>COST</span><strong>{Number(run.total_cost).toFixed(2)}</strong></div></section>
    <section className="workspace-grid">
      <article className="workspace-card"><header><h2>Current state</h2><span>{run.state.replaceAll("_"," ")}</span></header><div className="empty-state"><div><b>{terminalStates.has(run.state)?"Run finished.":run.state==="WAITING_FOR_APPROVAL"?"Approval required before progress.":"Ready for the next checkpointed transition."}</b><p>This preview performs no model execution, tool calls, sandbox work or external network actions.</p></div></div>{canAdvance?<form className="workspace-form" action={advancePreGpuAgentRun}><input type="hidden" name="organization_id" value={ws.organizationId}/><input type="hidden" name="run_id" value={id}/><button className="button" type="submit">Advance one step</button></form>:null}</article>
      <article className="workspace-card"><header><h2>Approval</h2><span>{pending?"Pending":approvals?.[0]?.status??"Not required"}</span></header>{pending&&isAdmin?<><p className="form-note">Requested {new Date(pending.requested_at).toLocaleString("en-GB")} · expires {pending.expires_at?new Date(pending.expires_at).toLocaleString("en-GB"):"not set"}</p><form className="auth-form" action={reviewAgentApproval}><input type="hidden" name="organization_id" value={ws.organizationId}/><input type="hidden" name="approval_id" value={pending.id}/><input type="hidden" name="run_id" value={id}/><label>Review note<input name="reason" maxLength={2000} placeholder="Optional reason"/></label><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="button" name="decision" value="approved" type="submit">Approve</button><button className="button secondary" name="decision" value="rejected" type="submit">Reject</button></div></form></>:pending?<div className="empty-state"><div><b>Waiting for an organization admin.</b><p>The run cannot advance until the approval request is reviewed.</p></div></div>:approvals?.length?<div className="project-row"><div><b>{approvals[0].status}</b><small>{approvals[0].reason||"No review note"}</small></div><span>{approvals[0].reviewed_at?new Date(approvals[0].reviewed_at).toLocaleString("en-GB"):""}</span></div>:<div className="empty-state"><div><b>No approval gate was required.</b><p>This preview can advance directly through its safe internal states.</p></div></div>}</article>
    </section>
    <section className="workspace-grid">
      <article className="workspace-card"><header><h2>Steps</h2><span>{steps?.length??0}</span></header>{steps?.length?steps.map((step)=><div className="project-row" key={step.id}><div><b>Step {step.step_number} · {step.state.replaceAll("_"," ")}</b><small>{step.execution_status} · {new Date(step.created_at).toLocaleString("en-GB")}</small></div><span>saved</span></div>):<div className="empty-state"><b>No steps yet.</b></div>}</article>
      <article className="workspace-card"><header><h2>Checkpoints</h2><span>{checkpoints?.length??0}</span></header>{checkpoints?.length?checkpoints.map((checkpoint)=><div className="project-row" key={checkpoint.id}><div><b>Checkpoint {checkpoint.step_number}</b><small>{checkpoint.current_state.replaceAll("_"," ")} · {new Date(checkpoint.created_at).toLocaleString("en-GB")}</small></div><span>recoverable</span></div>):<div className="empty-state"><b>No checkpoints yet.</b></div>}</article>
    </section>
  </div>;
}
