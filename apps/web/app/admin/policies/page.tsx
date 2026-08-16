import { requireSuperadmin } from "@/lib/admin/guard";
import { assignPolicyVersion,createPolicy,setPolicyEnabled } from "../ai-control-actions";

export const dynamic = "force-dynamic";

type PolicySimulation = {
  allowed:boolean;
  final_action:string;
  requires_approval:boolean;
  matched_rules:unknown;
};

export default async function PolicyCenterPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const { admin } = await requireSuperadmin();
  const search = await searchParams;
  const simRunId = typeof search.sim_run === "string" ? search.sim_run : "";
  const simResource = typeof search.sim_resource === "string" ? search.sim_resource.slice(0,180) : "network-scan";
  const simCategory = typeof search.sim_category === "string" ? search.sim_category.slice(0,120) : "tool";

  const [setsResult,versionsResult,assignmentsResult,rulesResult,runsResult] = await Promise.all([
    admin.schema("policies").from("policy_sets").select("id,key,name,description,layer,locked,enabled,current_version,updated_at").order("locked",{ascending:false}).order("name"),
    admin.schema("policies").from("policy_versions").select("id,policy_set_id,version,status,activated_at,created_at").order("version",{ascending:false}),
    admin.schema("policies").from("policy_assignments").select("id,policy_version_id,scope_type,scope_id,enabled,priority,created_at").eq("enabled",true).order("priority",{ascending:false}),
    admin.schema("policies").from("policy_rules").select("id,policy_version_id,category,resource,action,severity,priority,non_overridable").order("priority",{ascending:false}),
    admin.schema("ai").from("agent_runs").select("id,organization_id,project_id,objective,state,created_at").order("created_at",{ascending:false}).limit(40),
  ]);
  for (const result of [setsResult,versionsResult,assignmentsResult,rulesResult,runsResult]) if (result.error) throw result.error;
  const sets = setsResult.data ?? [];
  const versions = versionsResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];
  const rules = rulesResult.data ?? [];
  const runs = runsResult.data ?? [];
  const activeVersionFor = (setId:string) => versions.find((v) => v.policy_set_id===setId && v.status==="active");

  const simRun = simRunId ? runs.find((run)=>run.id===simRunId) : null;
  let simulation:PolicySimulation|null = null;
  let simulationError = "";
  if (simRun) {
    const result = await admin.schema("policies").rpc("evaluate_action",{
      p_organization_id:simRun.organization_id,
      p_project_id:simRun.project_id,
      p_agent_run_id:simRun.id,
      p_category:simCategory,
      p_resource:simResource,
    }).maybeSingle();
    if (result.error) simulationError = result.error.message;
    else if (result.data) simulation = result.data as PolicySimulation;
  }

  return <div className="admin-page">
    <div className="admin-heading"><div className="admin-heading-copy"><div className="admin-eyebrow">VEXONYX / AI / POLICIES</div><h1>Policy Center</h1><p>Create, version, assign and simulate structured guardrails without redeploying code. Platform enforcement stays below this layer and cannot be disabled by ordinary policy changes.</p></div></div>

    <div className="admin-grid equal">
      <section className="admin-card"><div className="admin-card-header"><h2>Create policy</h2><span>VERSION 1</span></div><div className="admin-card-body">
        <form action={createPolicy} className="admin-health" style={{gap:12}}>
          <div className="admin-form-inline"><input className="admin-input" name="name" required maxLength={160} placeholder="Policy name"/><input className="admin-input" name="key" maxLength={96} placeholder="policy-key (optional)"/></div>
          <input className="admin-input" name="description" maxLength={1000} placeholder="Purpose and expected use"/>
          <div className="admin-form-inline"><label><small>Policy layer</small><select className="admin-select" name="layer" defaultValue="global"><option value="global">Global</option><option value="plan">Plan</option><option value="organization">Organization</option><option value="workspace">Workspace</option><option value="agent">Agent</option><option value="run">Run</option></select></label><label><small>Assign to</small><select className="admin-select" name="scope_type" defaultValue="global"><option value="global">Global</option><option value="plan">Plan</option><option value="organization">Organization</option><option value="workspace">Workspace</option><option value="agent">Agent</option><option value="run">Run</option></select></label><label><small>Scope ID</small><input className="admin-input" name="scope_id" placeholder="Leave blank for global"/></label></div>
          <div className="admin-divider" />
          <div className="admin-detail-grid">
            <label className="admin-detail-card"><span>Network scanning</span><select className="admin-select" name="network_scan" defaultValue="allow_scoped"><option value="allow_scoped">Allow in scope</option><option value="require_approval">Require approval</option><option value="deny">Deny</option></select></label>
            <label className="admin-detail-card"><span>Browser</span><select className="admin-select" name="browser" defaultValue="allow_scoped"><option value="allow_scoped">Allow in scope</option><option value="require_approval">Require approval</option><option value="deny">Deny</option></select></label>
            <label className="admin-detail-card"><span>Shell</span><select className="admin-select" name="shell" defaultValue="sandbox_only"><option value="sandbox_only">Sandbox only</option><option value="require_approval">Require approval</option><option value="deny">Deny</option></select></label>
            <label className="admin-detail-card"><span>File execution</span><select className="admin-select" name="file_execution" defaultValue="sandbox_only"><option value="sandbox_only">Sandbox only</option><option value="require_approval">Require approval</option><option value="deny">Deny</option></select></label>
            <label className="admin-detail-card"><span>Image nudity</span><select className="admin-select" name="image_nudity" defaultValue="deny"><option value="deny">Block</option><option value="allow">Allow</option></select></label>
          </div>
          <div><button className="admin-button primary" type="submit">Create active version</button></div>
        </form>
      </div></section>
      <section className="admin-card"><div className="admin-card-header"><h2>Enforcement order</h2><span>DETERMINISTIC</span></div><div className="admin-card-body"><div className="admin-health">
        {["Platform enforcement","Global policy","Subscription / plan","Organization","Workspace / project","Agent profile","Run-specific"].map((label,index)=><div className="admin-health-row" key={label}><b>{label}</b><code>{index+1}</code></div>)}
      </div><div className="admin-note" style={{marginTop:14}}>A more specific assignment may refine an editable policy. It can never bypass immutable tenant isolation, incident mode, kill switches, authorization, target scope, secret isolation or sandbox boundaries.</div></div></section>
    </div>

    <section className="admin-card"><div className="admin-card-header"><h2>Policy Simulator</h2><span>NO EXECUTION</span></div><div className="admin-card-body">
      <form method="get" className="admin-form-inline"><select className="admin-select" name="sim_run" defaultValue={simRunId} required><option value="">Choose recent agent run</option>{runs.map((run)=><option value={run.id} key={run.id}>{String(run.objective).slice(0,70)} · {run.state}</option>)}</select><select className="admin-select" name="sim_category" defaultValue={simCategory}><option value="tool">Tool</option><option value="content.image">Image content</option></select><select className="admin-select" name="sim_resource" defaultValue={simResource}><option value="network-scan">Network scan</option><option value="browser">Browser</option><option value="http-request">HTTP request</option><option value="dns-resolve">DNS resolve</option><option value="shell">Shell</option><option value="file-execution">File execution</option><option value="adult_nudity">Adult nudity</option></select><button className="admin-button primary" type="submit">Simulate</button></form>
      {simulation ? <div className="admin-detail-grid" style={{marginTop:14}}><div className="admin-detail-card"><span>Result</span><strong>{simulation.allowed ? "ALLOWED" : "DENIED"}</strong><small>Final action: {simulation.final_action}</small></div><div className="admin-detail-card"><span>Approval</span><strong>{simulation.requires_approval ? "REQUIRED" : "NOT REQUIRED"}</strong><small>Simulation never invokes the tool.</small></div><div className="admin-detail-card"><span>Matched rules</span><strong>{Array.isArray(simulation.matched_rules) ? simulation.matched_rules.length : 0}</strong><small>Effective hierarchy evidence.</small></div></div> : null}
      {simulationError ? <p className="form-error" style={{marginTop:12}}>{simulationError}</p> : null}
      {!runs.length ? <div className="admin-note" style={{marginTop:14}}>No agent run exists yet. Once a run exists, the simulator can resolve the exact effective policy without executing a model or tool.</div> : null}
    </div></section>

    <section className="admin-card" style={{marginTop:10}}><div className="admin-card-header"><h2>Policy sets</h2><span>{sets.length} sets</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Policy</th><th>Layer</th><th>Version</th><th>Rules</th><th>Assignments</th><th>Status</th><th>Actions</th></tr></thead><tbody>{sets.map((set) => {
      const version = activeVersionFor(set.id);
      const setRules = version ? rules.filter((r)=>r.policy_version_id===version.id) : [];
      const setAssignments = version ? assignments.filter((a)=>a.policy_version_id===version.id) : [];
      return <tr key={set.id}><td><b>{set.name}</b><small>{set.key}{set.locked ? " · protected" : ""}</small></td><td>{set.layer}</td><td>{version ? `v${version.version} · ${version.status}` : "—"}</td><td>{setRules.length}<small>{setRules.slice(0,2).map((r)=>`${r.resource}: ${r.action}`).join(" · ")}</small></td><td>{setAssignments.length}<small>{setAssignments.slice(0,2).map((a)=>`${a.scope_type}${a.scope_id ? `:${a.scope_id}` : ""}`).join(" · ")}</small></td><td><span className={`admin-status ${set.enabled ? "good" : "bad"}`}>{set.enabled ? "enabled" : "disabled"}</span></td><td><div className="admin-action-row">{!set.locked ? <form action={setPolicyEnabled}><input type="hidden" name="policy_set_id" value={set.id}/><input type="hidden" name="enabled" value={set.enabled ? "false" : "true"}/><button className={`admin-button ${set.enabled ? "danger" : "primary"}`} type="submit">{set.enabled ? "Disable" : "Enable"}</button></form> : <span className="admin-count">Migration controlled</span>}</div></td></tr>;
    })}</tbody></table></div></section>

    <section className="admin-card" style={{marginTop:10}}><div className="admin-card-header"><h2>Assign active policy version</h2><span>GLOBAL → RUN</span></div><div className="admin-card-body"><form action={assignPolicyVersion} className="admin-form-inline"><select className="admin-select" name="policy_version_id" required><option value="">Choose policy</option>{sets.filter((set)=>!set.locked).map((set)=>{const version=activeVersionFor(set.id);return version ? <option value={version.id} key={version.id}>{set.name} · v{version.version}</option> : null;})}</select><select className="admin-select" name="scope_type" defaultValue="global"><option value="global">Global</option><option value="plan">Plan</option><option value="organization">Organization</option><option value="workspace">Workspace</option><option value="agent">Agent</option><option value="run">Run</option></select><input className="admin-input" name="scope_id" placeholder="Scope ID; blank for global"/><button className="admin-button primary" type="submit">Assign</button></form></div></section>
  </div>;
}
