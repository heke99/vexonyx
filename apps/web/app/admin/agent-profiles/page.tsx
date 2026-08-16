import { requireSuperadmin } from "@/lib/admin/guard";
import { createAgentProfile,setAgentProfileEnabled } from "../ai-control-actions";

export const dynamic = "force-dynamic";

export default async function AgentProfilesPage() {
  const { admin } = await requireSuperadmin();
  const [profilesResult,versionsResult,modelsResult,preferencesResult] = await Promise.all([
    admin.schema("ai").from("agent_profiles").select("id,organization_id,slug,name,description,category,enabled,current_version,updated_at").order("name"),
    admin.schema("ai").from("agent_profile_versions").select("id,agent_profile_id,version,status,max_autonomy,sandbox_profile,network_access,timeout_seconds,max_steps,max_tool_calls,max_cost").order("version",{ascending:false}),
    admin.schema("ai").from("models").select("alias,role,enabled").order("alias"),
    admin.schema("ai").from("agent_model_preferences").select("agent_profile_version_id,model_alias,purpose,preference_order,enabled").eq("enabled",true).order("preference_order"),
  ]);
  for (const result of [profilesResult,versionsResult,modelsResult,preferencesResult]) if (result.error) throw result.error;
  const profiles = profilesResult.data ?? [];
  const versions = versionsResult.data ?? [];
  const models = modelsResult.data ?? [];
  const preferences = preferencesResult.data ?? [];
  const activeVersion = (profileId:string,current:number) => versions.find((v)=>v.agent_profile_id===profileId && v.version===current) ?? versions.find((v)=>v.agent_profile_id===profileId);

  return <div className="admin-page">
    <div className="admin-heading"><div className="admin-heading-copy"><div className="admin-eyebrow">VEXONYX / AI / AGENTS</div><h1>Agent profiles</h1><p>Agents are versioned configuration profiles. They select planning posture, sandbox/network posture, model preferences and allowed tool capabilities while execution remains governed by policy and engagement scope.</p></div></div>

    <div className="admin-grid equal">
      <section className="admin-card"><div className="admin-card-header"><h2>Create agent profile</h2><span>SAFE DEFAULTS</span></div><div className="admin-card-body"><form action={createAgentProfile} className="admin-health" style={{gap:12}}>
        <div className="admin-form-inline"><input className="admin-input" name="name" required maxLength={120} placeholder="Agent name"/><input className="admin-input" name="slug" maxLength={63} placeholder="agent-slug (optional)"/></div>
        <input className="admin-input" name="description" maxLength={1000} placeholder="What this agent is for"/>
        <div className="admin-form-inline"><label><small>Category</small><input className="admin-input" name="category" defaultValue="security"/></label><label><small>Autonomy</small><select className="admin-select" name="max_autonomy" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label><small>Network</small><select className="admin-select" name="network_access" defaultValue="scope_only"><option value="none">None</option><option value="scope_only">Scope only</option><option value="internet">Internet</option><option value="allowlist">Allowlist</option><option value="custom">Custom</option></select></label></div>
        <label><small>Preferred model alias</small><select className="admin-select" name="model_alias" defaultValue="vexonyx-general">{models.map((model)=><option value={model.alias} key={model.alias}>{model.alias} · {model.role}{model.enabled ? " · enabled" : " · disabled"}</option>)}</select></label>
        <div className="admin-note">New profiles start as internal configuration with no new tool permissions. Model and external-tool execution remain subject to independent enablement, deployment, policy, scope and sandbox gates.</div>
        <div><button className="admin-button primary" type="submit">Create profile v1</button></div>
      </form></div></section>
      <section className="admin-card"><div className="admin-card-header"><h2>Profile contract</h2><span>VERSIONED</span></div><div className="admin-card-body"><div className="admin-health">
        <div className="admin-health-row"><b>System instructions</b><span>version pinned</span></div>
        <div className="admin-health-row"><b>Max autonomy</b><span>low / medium / high</span></div>
        <div className="admin-health-row"><b>Sandbox profile</b><span>isolated</span></div>
        <div className="admin-health-row"><b>Network access</b><span>explicit mode</span></div>
        <div className="admin-health-row"><b>Model preferences</b><span>ordered</span></div>
        <div className="admin-health-row"><b>Tools</b><span>capability assignments</span></div>
        <div className="admin-health-row"><b>Rollback</b><span>previous version retained</span></div>
      </div></div></section>
    </div>

    <section className="admin-card"><div className="admin-card-header"><h2>Profiles</h2><span>{profiles.length} profiles</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Agent</th><th>Version</th><th>Autonomy</th><th>Network</th><th>Model preference</th><th>Status</th><th>Action</th></tr></thead><tbody>{profiles.map((profile)=>{
      const version = activeVersion(profile.id,profile.current_version);
      const modelPrefs = version ? preferences.filter((item)=>item.agent_profile_version_id===version.id) : [];
      return <tr key={profile.id}><td><b>{profile.name}</b><small>{profile.slug} · {profile.organization_id ? "organization" : "platform"}</small></td><td>{version ? `v${version.version} · ${version.status}` : "—"}</td><td>{version?.max_autonomy ?? "—"}</td><td>{version?.network_access ?? "—"}<small>{version?.sandbox_profile ?? ""}</small></td><td>{modelPrefs.length ? modelPrefs.map((item)=>`${item.purpose}: ${item.model_alias}`).join(" · ") : "—"}</td><td><span className={`admin-status ${profile.enabled ? "good" : "bad"}`}>{profile.enabled ? "enabled" : "disabled"}</span></td><td><form action={setAgentProfileEnabled}><input type="hidden" name="profile_id" value={profile.id}/><input type="hidden" name="enabled" value={profile.enabled ? "false" : "true"}/><button className={`admin-button ${profile.enabled ? "danger" : "primary"}`} type="submit">{profile.enabled ? "Disable" : "Enable"}</button></form></td></tr>;
    })}</tbody></table></div></section>
  </div>;
}
