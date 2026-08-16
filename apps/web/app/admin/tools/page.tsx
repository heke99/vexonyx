import { requireSuperadmin } from "@/lib/admin/guard";
import { setToolEnabled } from "../ai-control-actions";

export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const { admin } = await requireSuperadmin();
  const [toolsResult,stateResult] = await Promise.all([
    admin.schema("ai").from("tool_definitions").select("id,name,version,category,required_permissions,requires_project,requires_scope,requires_approval,execution_environment,timeout_seconds,cost_class,enabled,needs_network,retired_at").is("retired_at",null).order("category").order("name"),
    admin.schema("operations").from("system_state").select("external_tools_enabled,sandbox_scheduling_enabled,external_network_enabled,incident_mode").eq("singleton",true).maybeSingle(),
  ]);
  if (toolsResult.error) throw toolsResult.error;
  if (stateResult.error) throw stateResult.error;
  const tools = toolsResult.data ?? [];
  const state = stateResult.data;

  return <div className="admin-page">
    <div className="admin-heading"><div className="admin-heading-copy"><div className="admin-eyebrow">VEXONYX / AI / TOOLS</div><h1>Tool capabilities</h1><p>Tools are capabilities, not direct operating-system access. Every execution still passes platform state, kill switches, run binding, authorization, target scope, policy, approval and sandbox checks.</p></div></div>
    <div className="admin-metrics">
      <div className="admin-metric"><div className="admin-metric-label"><span>Definitions</span><span>Registry</span></div><strong>{tools.length}</strong><small>Version-pinned capability contracts</small></div>
      <div className="admin-metric"><div className="admin-metric-label"><span>Enabled definitions</span><span>Tool layer</span></div><strong>{tools.filter((tool)=>tool.enabled).length}</strong><small>Still subject to global gates</small></div>
      <div className="admin-metric"><div className="admin-metric-label"><span>Sandbox scheduling</span><span>Platform</span></div><strong>{state?.sandbox_scheduling_enabled ? "ON" : "OFF"}</strong><small>{state?.incident_mode ?? "unknown"}</small></div>
      <div className="admin-metric"><div className="admin-metric-label"><span>External network</span><span>Platform</span></div><strong>{state?.external_network_enabled ? "ON" : "OFF"}</strong><small>{state?.external_tools_enabled ? "Tool gate enabled" : "Tool gate fail-closed"}</small></div>
    </div>
    <div className="admin-note" style={{marginBottom:10}}>Enabling a definition does not grant execution by itself. The production control plane currently keeps sandbox scheduling and external network independently gated, and scoped tools require an active authorized engagement target.</div>
    <section className="admin-card"><div className="admin-card-header"><h2>Capability inventory</h2><span>SANDBOX FIRST</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Tool</th><th>Category</th><th>Execution</th><th>Scope</th><th>Approval</th><th>Network</th><th>Status</th><th>Action</th></tr></thead><tbody>{tools.map((tool)=><tr key={tool.id}><td><b>{tool.name}</b><small>v{tool.version} · {tool.cost_class} cost</small></td><td>{tool.category}<small>{tool.required_permissions?.join(", ") || "—"}</small></td><td>{tool.execution_environment}<small>{tool.timeout_seconds}s timeout</small></td><td><span className={`admin-status ${tool.requires_scope ? "warn" : "neutral"}`}>{tool.requires_scope ? "required" : "not required"}</span></td><td><span className={`admin-status ${tool.requires_approval ? "warn" : "neutral"}`}>{tool.requires_approval ? "required" : "policy"}</span></td><td>{tool.needs_network ? "network" : "local"}</td><td><span className={`admin-status ${tool.enabled ? "good" : "neutral"}`}>{tool.enabled ? "enabled" : "disabled"}</span></td><td><form action={setToolEnabled}><input type="hidden" name="tool_id" value={tool.id}/><input type="hidden" name="enabled" value={tool.enabled ? "false" : "true"}/><button className={`admin-button ${tool.enabled ? "danger" : "primary"}`} type="submit">{tool.enabled ? "Disable" : "Enable definition"}</button></form></td></tr>)}</tbody></table></div></section>
  </div>;
}
