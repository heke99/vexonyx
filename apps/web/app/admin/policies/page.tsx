import { requireSuperadmin } from "@/lib/admin/guard";
import { assignPolicyVersion,createPolicy,setPolicyEnabled } from "../ai-control-actions";

export const dynamic = "force-dynamic";

export default async function PolicyCenterPage() {
  const { admin } = await requireSuperadmin();
  const [setsResult,versionsResult,assignmentsResult,rulesResult] = await Promise.all([
    admin.schema("policies").from("policy_sets").select("id,key,name,description,layer,locked,enabled,current_version,updated_at").order("locked",{ascending:false}).order("name"),
    admin.schema("policies").from("policy_versions").select("id,policy_set_id,version,status,activated_at,created_at").order("version",{ascending:false}),
    admin.schema("policies").from("policy_assignments").select("id,policy_version_id,scope_type,scope_id,enabled,priority,created_at").eq("enabled",true).order("priority",{ascending:false}),
    admin.schema("policies").from("policy_rules").select("id,policy_version_id,category,resource,action,severity,priority,non_overridable").order("priority",{ascending:false}),
  ]);
  for (const result of [setsResult,versionsResult,assignmentsResult,rulesResult]) if (result.error) throw result.error;
  const sets = setsResult.data ?? [];
  const versions = versionsResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];
  const rules = rulesResult.data ?? [];
  const activeVersionFor = (setId:string) => versions.find((v) => v.policy_set_id===setId && v.status==="active");

  return <div className="admin-page">
    <div className="admin-heading"><div className="admin-heading-copy"><div className="admin-eyebrow">VEXONYX / AI / POLICIES</div><h1>Policy Center</h1><p>Create, version and assign structured guardrails without redeploying code. Platform enforcement stays below this layer and cannot be disabled by ordinary policy changes.</p></div></div>

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
      </div><div className="admin-note" style={{marginTop:14}}>A more specific assignment may refine an editable policy. It can never bypass the immutable platform checks for tenant isolation, incident mode, kill switches, authorization, target scope, secrets or sandbox boundaries.</div></div></section>
    </div>

    <section className="admin-card"><div className="admin-card-header"><h2>Policy sets</h2><span>{sets.length} sets</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Policy</th><th>Layer</th><th>Version</th><th>Rules</th><th>Assignments</th><th>Status</th><th>Actions</th></tr></thead><tbody>{sets.map((set) => {
      const version = activeVersionFor(set.id);
      const setRules = version ? rules.filter((r)=>r.policy_version_id===version.id) : [];
      const setAssignments = version ? assignments.filter((a)=>a.policy_version_id===version.id) : [];
      return <tr key={set.id}><td><b>{set.name}</b><small>{set.key}{set.locked ? " · protected" : ""}</small></td><td>{set.layer}</td><td>{version ? `v${version.version} · ${version.status}` : "—"}</td><td>{setRules.length}<small>{setRules.slice(0,2).map((r)=>`${r.resource}: ${r.action}`).join(" · ")}</small></td><td>{setAssignments.length}<small>{setAssignments.slice(0,2).map((a)=>`${a.scope_type}${a.scope_id ? `:${a.scope_id}` : ""}`).join(" · ")}</small></td><td><span className={`admin-status ${set.enabled ? "good" : "bad"}`}>{set.enabled ? "enabled" : "disabled"}</span></td><td><div className="admin-action-row">{!set.locked ? <form action={setPolicyEnabled}><input type="hidden" name="policy_set_id" value={set.id}/><input type="hidden" name="enabled" value={set.enabled ? "false" : "true"}/><button className={`admin-button ${set.enabled ? "danger" : "primary"}`} type="submit">{set.enabled ? "Disable" : "Enable"}</button></form> : <span className="admin-count">Migration controlled</span>}</div></td></tr>;
    })}</tbody></table></div></section>

    <section className="admin-card" style={{marginTop:10}}><div className="admin-card-header"><h2>Assign active policy version</h2><span>GLOBAL → RUN</span></div><div className="admin-card-body"><form action={assignPolicyVersion} className="admin-form-inline"><select className="admin-select" name="policy_version_id" required><option value="">Choose policy</option>{sets.filter((set)=>!set.locked).map((set)=>{const version=activeVersionFor(set.id);return version ? <option value={version.id} key={version.id}>{set.name} · v{version.version}</option> : null;})}</select><select className="admin-select" name="scope_type" defaultValue="global"><option value="global">Global</option><option value="plan">Plan</option><option value="organization">Organization</option><option value="workspace">Workspace</option><option value="agent">Agent</option><option value="run">Run</option></select><input className="admin-input" name="scope_id" placeholder="Scope ID; blank for global"/><button className="admin-button primary" type="submit">Assign</button></form></div></section>
  </div>;
}
