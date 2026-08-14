import { notFound, redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setIncidentMode } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage(){
  const client = await createClient();
  const {data:claims} = await client.auth.getClaims();
  const id = claims?.claims?.sub;
  if (!id) redirect("/login");
  const {data:profile} = await client.schema("app").from("profiles").select("is_superadmin").eq("id",id).single();
  if (!profile?.is_superadmin) notFound();

  const admin = createAdminClient();
  let platformState:null|Record<string,unknown> = null;
  let counts = {models:0,runs:0,waitlist:0};
  if (admin) {
    const [state,models,runs,waitlist] = await Promise.all([
      admin.schema("operations").from("system_state").select("*").eq("singleton",true).maybeSingle(),
      admin.schema("ai").from("models").select("*",{count:"exact",head:true}),
      admin.schema("ai").from("agent_runs").select("*",{count:"exact",head:true}),
      admin.schema("launch").from("waitlist_entries").select("*",{count:"exact",head:true}),
    ]);
    platformState = state.data;
    counts = {models:models.count??0,runs:runs.count??0,waitlist:waitlist.count??0};
  }

  return <main className="content-page">
    <div className="shell" style={{paddingTop:28}}><Brand/></div>
    <section className="shell content-hero"><div className="section-label">SUPERADMIN</div><h1>Platform control.</h1><p>Emergency and incident controls are deliberately separated from organization permissions and normal workspace access.</p></section>
    <section className="shell" style={{paddingBottom:100}}>
      <div className="metric-grid"><div className="metric"><span>MODEL ALIASES</span><strong>{counts.models}</strong></div><div className="metric"><span>AGENT RUNS</span><strong>{counts.runs}</strong></div><div className="metric"><span>WAITLIST</span><strong>{counts.waitlist}</strong></div><div className="metric"><span>INCIDENT MODE</span><strong style={{fontSize:16}}>{String(platformState?.incident_mode??"unavailable")}</strong></div><div className="metric"><span>EXTERNAL ACTIONS</span><strong style={{fontSize:16}}>{platformState?.external_tools_enabled?"enabled":"disabled"}</strong></div></div>
      <article className="workspace-card" style={{marginTop:10}}><header><h2>Incident mode</h2><span>Protected admin action</span></header>{admin?<form className="workspace-form" action={setIncidentMode}><select name="mode" defaultValue={String(platformState?.incident_mode??"normal")} style={{background:"#090b0d",color:"white",border:"1px solid #2d333a",borderRadius:7,padding:"0 11px"}}><option value="normal">normal</option><option value="degraded">degraded</option><option value="maintenance">maintenance</option><option value="security_lockdown">security lockdown</option></select><button className="button" type="submit">Apply mode</button></form>:<div className="empty-state"><div><b>Privileged server access is not configured.</b><p>Organization workspaces remain available; protected admin changes stay unavailable until server access is configured.</p></div></div>}</article>
    </section>
  </main>;
}
