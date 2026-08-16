import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export default async function ModelRouterPage() {
  const { admin } = await requireSuperadmin();
  const [modelsResult,rulesResult,entitlementsResult,deploymentsResult] = await Promise.all([
    admin.schema("ai").from("models").select("id,alias,role,description,enabled,updated_at").order("role").order("alias"),
    admin.schema("ai").from("routing_rules").select("id,version,task_type,primary_alias,fallback_alias,escalation_alias,enabled,created_at").order("version",{ascending:false}).order("task_type"),
    admin.schema("ai").from("model_entitlements").select("id,scope_type,scope_id,model_alias,enabled,limits,updated_at").eq("enabled",true).order("scope_type"),
    admin.schema("ai").from("model_deployments").select("id,model_version_id,environment,status,gpu_provider,gpu_type,gpu_count,last_health_at").order("updated_at",{ascending:false}),
  ]);
  for (const result of [modelsResult,rulesResult,entitlementsResult,deploymentsResult]) if (result.error) throw result.error;
  const models = modelsResult.data ?? [];
  const rules = rulesResult.data ?? [];
  const entitlements = entitlementsResult.data ?? [];
  const deployments = deploymentsResult.data ?? [];

  return <div className="admin-page">
    <div className="admin-heading"><div className="admin-heading-copy"><div className="admin-eyebrow">VEXONYX / AI / ROUTER</div><h1>Model Router</h1><p>Auto routing separates user intent from provider infrastructure. Selection can use task type, required capabilities, entitlement, model health, latency, cost and measured historical quality without exposing deployment details to the client.</p></div><div className="admin-heading-actions"><Link className="admin-button" href="/admin/models">Model registry</Link><Link className="admin-button" href="/admin/deployments">Deployments</Link></div></div>

    <div className="admin-metrics">
      <div className="admin-metric"><div className="admin-metric-label"><span>Models</span><span>Aliases</span></div><strong>{models.length}</strong><small>{models.filter((model)=>model.enabled).length} enabled</small></div>
      <div className="admin-metric"><div className="admin-metric-label"><span>Routing rules</span><span>Versioned</span></div><strong>{rules.length}</strong><small>{rules.filter((rule)=>rule.enabled).length} enabled rules</small></div>
      <div className="admin-metric"><div className="admin-metric-label"><span>Entitlements</span><span>Plan / org</span></div><strong>{entitlements.length}</strong><small>Explicit model access grants</small></div>
      <div className="admin-metric"><div className="admin-metric-label"><span>Deployments</span><span>Infrastructure</span></div><strong>{deployments.length}</strong><small>{deployments.filter((deployment)=>["ready","healthy","active"].includes(String(deployment.status))).length} ready/healthy</small></div>
    </div>

    <section className="admin-card"><div className="admin-card-header"><h2>User-facing selection</h2><span>ABSTRACTION</span></div><div className="admin-card-body"><div className="admin-detail-grid">
      <div className="admin-detail-card"><span>VEXONYX Auto</span><strong>Dynamic routing</strong><small>Best eligible model for the task and current health.</small></div>
      <div className="admin-detail-card"><span>VEXONYX Fast</span><strong>Latency first</strong><small>Fast eligible path with normal policy enforcement.</small></div>
      <div className="admin-detail-card"><span>VEXONYX Pro</span><strong>Quality first</strong><small>Stronger general/security reasoning within plan entitlements.</small></div>
      <div className="admin-detail-card"><span>VEXONYX Deep</span><strong>Reasoning first</strong><small>Longer reasoning budget for difficult analysis.</small></div>
    </div><div className="admin-note" style={{marginTop:14}}>Specific-model selection is represented separately and must satisfy model enablement plus plan/organization entitlement. The client never chooses an inference endpoint.</div></div></section>

    <section className="admin-card" style={{marginTop:10}}><div className="admin-card-header"><h2>Routing rules</h2><span>PRIMARY → FALLBACK → ESCALATION</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Task</th><th>Version</th><th>Primary</th><th>Fallback</th><th>Escalation</th><th>Status</th></tr></thead><tbody>{rules.map((rule)=><tr key={rule.id}><td><b>{rule.task_type}</b></td><td>v{rule.version}</td><td>{rule.primary_alias}</td><td>{rule.fallback_alias ?? "—"}</td><td>{rule.escalation_alias ?? "—"}</td><td><span className={`admin-status ${rule.enabled ? "good" : "neutral"}`}>{rule.enabled ? "enabled" : "disabled"}</span></td></tr>)}</tbody></table></div></section>

    <section className="admin-card" style={{marginTop:10}}><div className="admin-card-header"><h2>Model availability</h2><span>FAIL CLOSED</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Alias</th><th>Role</th><th>Enabled</th><th>Entitlements</th></tr></thead><tbody>{models.map((model)=><tr key={model.id}><td><b>{model.alias}</b><small>{model.description ?? "Internal model alias"}</small></td><td>{model.role}</td><td><span className={`admin-status ${model.enabled ? "good" : "neutral"}`}>{model.enabled ? "enabled" : "disabled"}</span></td><td>{entitlements.filter((item)=>item.model_alias===model.alias).length}</td></tr>)}</tbody></table></div></section>
  </div>;
}
