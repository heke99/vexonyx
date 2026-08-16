import Link from "next/link";
import { MockChat } from "@/components/mock-chat";
import { getWorkspace } from "@/lib/workspace";

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const [conversations,projects,profilesResult,versionsResult,preferenceResult,availableModelsResult] = await Promise.all([
    ws.supabase.schema("app").from("conversations").select("id,title,status,project_id,model_selection_mode,updated_at").eq("organization_id",ws.organizationId).eq("user_id",ws.userId).neq("status","deleted").order("updated_at",{ascending:false}).limit(30),
    ws.supabase.schema("app").from("projects").select("id,name").eq("organization_id",ws.organizationId).is("deleted_at",null).order("updated_at",{ascending:false}).limit(100),
    ws.supabase.schema("ai").from("agent_profiles").select("id,name,slug,current_version,enabled").eq("enabled",true).order("name"),
    ws.supabase.schema("ai").from("agent_profile_versions").select("id,agent_profile_id,version,status"),
    ws.supabase.schema("app").from("user_model_preferences").select("model_selection_mode,model_alias").eq("organization_id",ws.organizationId).eq("user_id",ws.userId).maybeSingle(),
    ws.supabase.schema("ai").rpc("available_models_for_user",{p_organization_id:ws.organizationId}),
  ]);

  const profiles = profilesResult.data ?? [];
  const versions = versionsResult.data ?? [];
  const agentProfiles = profiles.filter((profile)=>versions.some((version)=>version.agent_profile_id===profile.id && version.version===profile.current_version)).map((profile)=>({id:profile.id,name:profile.name}));
  const defaultAgent = profiles.find((profile)=>profile.slug==="general-security")?.id ?? agentProfiles[0]?.id ?? null;
  const preference = preferenceResult.data;
  const availableModels = availableModelsResult.error ? [] : (availableModelsResult.data ?? []);

  return <div className="app-content">
    <div className="app-heading"><div><h1>Chat</h1><p>Persistent conversations keep messages, agent profile, model-routing choice, project context and usage connected across reloads.</p></div></div>
    <section className="workspace-grid">
      <article className="workspace-card"><header><h2>Conversations</h2><span>{conversations.data?.length ?? 0}</span></header>
        {conversations.error ? <div className="empty-state"><div><b>Conversations could not be loaded.</b><p>No messages were changed.</p></div></div> : conversations.data?.length ? conversations.data.map((conversation)=><Link className="project-row" href={`/app/chat/${conversation.id}`} key={conversation.id}><div><b>{conversation.title}</b><small>{conversation.status} · {String(conversation.model_selection_mode ?? "auto").replaceAll("_"," ")} · updated {new Date(conversation.updated_at).toLocaleString("en-GB")}</small></div><span>Open →</span></Link>) : <div className="empty-state"><div><b>No conversations yet.</b><p>Start below. The first message creates a persistent conversation.</p></div></div>}
      </article>
      <MockChat organizationId={ws.organizationId} projects={projects.data ?? []} agentProfiles={agentProfiles} initialAgentProfileId={defaultAgent} availableModels={availableModels} initialModelSelectionMode={preference?.model_selection_mode ?? "auto"} initialSelectedModelAlias={preference?.model_alias ?? null}/>
    </section>
  </div>;
}
