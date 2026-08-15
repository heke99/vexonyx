import { getWorkspace } from "@/lib/workspace";

export default async function IntegrationsPage() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;
  const [catalog, installs] = await Promise.all([
    ws.supabase.schema("integrations").from("catalog").select("id,slug,kind,name,description,auth_type,capabilities,status").order("kind").order("name"),
    ws.supabase.schema("integrations").from("installations").select("id,catalog_id,status,display_name,granted_scopes,last_success_at,last_error_code,updated_at").eq("organization_id",ws.organizationId),
  ]);
  const byCatalog = new Map((installs.data ?? []).map((row)=>[row.catalog_id,row]));
  return <div className="app-content">
    <div className="app-heading"><div><h1>Connectors & plugins</h1><p>Bring approved external context into VEXONYX without leaking credentials into chats, logs or browser storage. Integrations are scoped to your organization.</p></div></div>
    <section className="workspace-card"><header><h2>Integration catalog</h2><span>{catalog.data?.length ?? 0} available / planned</span></header>
      {catalog.error ? <div className="empty-state"><b>Integration catalog could not be loaded.</b></div> : catalog.data?.length ? catalog.data.map((item)=>{const installed=byCatalog.get(item.id);return <div className="project-row" key={item.id}><div><b>{item.name} <small style={{display:"inline"}}>· {item.kind}</small></b><small>{item.description || "VEXONYX integration"} · {item.auth_type} · {(item.capabilities ?? []).join(", ") || "no capabilities published"}</small></div><span>{installed ? installed.status : item.status === "active" || item.status === "private_beta" ? "Ready to connect" : "Planned"}</span></div>}) : <div className="empty-state"><div><b>No integrations published.</b><p>Connectors remain fail-closed until their OAuth/API credential boundary and scope review are enabled.</p></div></div>}
    </section>
    <section className="workspace-card"><header><h2>Security boundary</h2><span>Fail closed</span></header><div className="project-row"><div><b>Credentials</b><small>Secrets are stored only as server-side vault references, never in the installation row visible to the client.</small></div><span>Server only</span></div><div className="project-row"><div><b>Scopes</b><small>Every installation records granted scopes and capabilities separately from the provider credential.</small></div><span>Explicit</span></div><div className="project-row"><div><b>Agent use</b><small>External tools still require authorization, project scope, tool policy and platform safety gates.</small></div><span>Disabled pre-GPU</span></div></section>
  </div>;
}
