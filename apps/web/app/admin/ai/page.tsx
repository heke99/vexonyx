import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

async function countRows(admin: Awaited<ReturnType<typeof requireSuperadmin>>["admin"], schema: string, table: string) {
  const result = await admin.schema(schema).from(table).select("*", {count:"exact",head:true});
  if (result.error) throw result.error;
  return result.count ?? 0;
}

export default async function AiControlCenterPage() {
  const { admin } = await requireSuperadmin();
  const [models,profiles,policies,tools,learning,rollouts,stateResult] = await Promise.all([
    countRows(admin,"ai","models"),
    countRows(admin,"ai","agent_profiles"),
    countRows(admin,"policies","policy_sets"),
    countRows(admin,"ai","tool_definitions"),
    countRows(admin,"ai","learning_candidates"),
    countRows(admin,"ai","rollouts"),
    admin.schema("operations").from("system_state").select("incident_mode,agents_enabled,external_tools_enabled,sandbox_scheduling_enabled,external_network_enabled").eq("singleton",true).maybeSingle(),
  ]);
  if (stateResult.error) throw stateResult.error;
  const state = stateResult.data;

  const areas = [
    ["/admin/models","Models","Internal aliases, versions, readiness and enablement gates."],
    ["/admin/model-router","Model Router","Task routing, fallback and escalation strategy."],
    ["/admin/agent-profiles","Agents","Versioned agent profiles, autonomy, model preference and network posture."],
    ["/admin/policies","Policies","Versioned policy sets and assignments across global, plan, organization, workspace, agent and run scopes."],
    ["/admin/tools","Tools","Capability inventory and sandbox-bound execution gates."],
    ["/admin/memory","Memory","Trust, sensitivity, authority and expiry metadata for saved context."],
    ["/admin/learning","Learning","Candidate improvements. Production agents never rewrite themselves directly."],
    ["/admin/evaluations","Evaluations","Model and agent quality evidence before promotion."],
    ["/admin/rollouts","Canary & rollback","Shadow, 1%, 5%, 25%, 50%, production and rollback metadata."],
    ["/admin/deployments","Deployments","GPU/inference deployment inventory. Remains fail-closed before verified infrastructure exists."],
  ] as const;

  return <div className="admin-page">
    <div className="admin-heading">
      <div className="admin-heading-copy"><div className="admin-eyebrow">VEXONYX / SUPERADMIN / AI</div><h1>AI Control Center</h1><p>One control plane for models, agents, tools, policies, memory, learning, evaluations and safe rollout. Immutable tenant, authorization, scope, secret and sandbox enforcement remains below these controls.</p></div>
    </div>

    <div className="admin-metrics">
      <div className="admin-metric"><div className="admin-metric-label"><span>Models</span><span>Registry</span></div><strong>{models}</strong><small>Aliases are separate from deployments</small></div>
      <div className="admin-metric"><div className="admin-metric-label"><span>Agent profiles</span><span>Versioned</span></div><strong>{profiles}</strong><small>Configuration, not separate products</small></div>
      <div className="admin-metric"><div className="admin-metric-label"><span>Policies</span><span>Effective</span></div><strong>{policies}</strong><small>Structured rules and assignments</small></div>
      <div className="admin-metric"><div className="admin-metric-label"><span>Tools</span><span>Capabilities</span></div><strong>{tools}</strong><small>{state?.external_tools_enabled ? "Global tool gate enabled" : "Global tool gate fail-closed"}</small></div>
    </div>

    <div className="admin-grid equal">
      <section className="admin-card"><div className="admin-card-header"><h2>Platform enforcement</h2><span>{state?.incident_mode ?? "unknown"}</span></div><div className="admin-card-body"><div className="admin-health">
        <div className="admin-health-row"><b>Agent orchestration</b><span className={`admin-status ${state?.agents_enabled ? "good" : "bad"}`}>{state?.agents_enabled ? "enabled" : "disabled"}</span></div>
        <div className="admin-health-row"><b>External tools</b><span className={`admin-status ${state?.external_tools_enabled ? "warn" : "neutral"}`}>{state?.external_tools_enabled ? "enabled" : "disabled"}</span></div>
        <div className="admin-health-row"><b>Sandbox scheduling</b><span className={`admin-status ${state?.sandbox_scheduling_enabled ? "warn" : "neutral"}`}>{state?.sandbox_scheduling_enabled ? "enabled" : "disabled"}</span></div>
        <div className="admin-health-row"><b>External network</b><span className={`admin-status ${state?.external_network_enabled ? "warn" : "neutral"}`}>{state?.external_network_enabled ? "enabled" : "disabled"}</span></div>
      </div><div className="admin-note" style={{marginTop:14}}>Effective capability is the intersection of platform enforcement, user permission, engagement scope, policy, agent profile, tool capability and model entitlement. Lower policy scopes cannot bypass immutable platform gates.</div></div></section>
      <section className="admin-card"><div className="admin-card-header"><h2>Controlled learning</h2><span>{learning} candidates</span></div><div className="admin-card-body"><div className="admin-health">
        <div className="admin-health-row"><b>Learning candidates</b><span>{learning}</span></div>
        <div className="admin-health-row"><b>Active rollouts</b><span>{rollouts}</span></div>
        <div className="admin-health-row"><b>Direct self-modification</b><span className="admin-status good">blocked</span></div>
      </div><div className="admin-note" style={{marginTop:14}}>Production runs create evidence and candidates. Promotion requires evaluation and then shadow/canary stages before production.</div></div></section>
    </div>

    <section className="admin-card"><div className="admin-card-header"><h2>Control surfaces</h2><span>PRE-GPU ARCHITECTURE</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Area</th><th>Responsibility</th><th /></tr></thead><tbody>{areas.map(([href,label,description]) => <tr key={href}><td><b>{label}</b></td><td>{description}</td><td><Link className="admin-button" href={href}>Open</Link></td></tr>)}</tbody></table></div></section>
  </div>;
}
