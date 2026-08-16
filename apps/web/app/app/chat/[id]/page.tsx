import { notFound } from "next/navigation";
import { MockChat } from "@/components/mock-chat";
import { getWorkspace } from "@/lib/workspace";
import { renameConversation, setConversationStatus } from "../actions";

function messageText(content:unknown) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return "";
  const text = (content as Record<string,unknown>).text;
  return typeof text === "string" ? text : "";
}

export default async function ConversationPage({params}:{params:Promise<{id:string}>}) {
  const {id} = await params;
  const ws = await getWorkspace();
  if (!ws?.organizationId) notFound();

  const {data:conversation} = await ws.supabase.schema("app").from("conversations").select("id,title,status,project_id,agent_profile_id,agent_profile_version_id,model_selection_mode,selected_model_alias,updated_at").eq("id",id).eq("organization_id",ws.organizationId).eq("user_id",ws.userId).maybeSingle();
  if (!conversation || conversation.status === "deleted") notFound();

  const [{data:messages,error:messagesError},{data:projects},{data:profiles},availableModelsResult] = await Promise.all([
    ws.supabase.schema("app").from("messages").select("id,role,content,created_at").eq("conversation_id",id).eq("organization_id",ws.organizationId).in("role",["user","assistant"]).order("created_at",{ascending:true}).limit(300),
    ws.supabase.schema("app").from("projects").select("id,name").eq("organization_id",ws.organizationId).is("deleted_at",null).order("updated_at",{ascending:false}).limit(100),
    ws.supabase.schema("ai").from("agent_profiles").select("id,name,enabled").eq("enabled",true).order("name"),
    ws.supabase.schema("ai").rpc("available_models_for_user",{p_organization_id:ws.organizationId}),
  ]);

  const initialMessages = (messages ?? []).map((message)=>({id:message.id,role:message.role as "user"|"assistant",text:messageText(message.content),createdAt:message.created_at})).filter((message)=>message.text);
  const agentProfiles = (profiles ?? []).map((profile)=>({id:profile.id,name:profile.name}));
  const availableModels = availableModelsResult.error ? [] : (availableModelsResult.data ?? []);

  return <div className="app-content">
    <div className="app-heading"><div><h1>{conversation.title}</h1><p>{conversation.project_id ? "Conversation is linked to project context." : "Private organization conversation."}</p></div><span>{conversation.status}</span></div>
    <section className="workspace-grid">
      <article className="workspace-card"><header><h2>Conversation</h2><span>Persistent</span></header>
        <form className="workspace-form" action={renameConversation}><input type="hidden" name="conversation_id" value={id}/><input type="hidden" name="organization_id" value={ws.organizationId}/><input name="title" defaultValue={conversation.title} maxLength={120} required/><button className="button" type="submit">Rename</button></form>
        <form className="workspace-form" action={setConversationStatus}><input type="hidden" name="conversation_id" value={id}/><input type="hidden" name="organization_id" value={ws.organizationId}/><input type="hidden" name="status" value={conversation.status === "archived" ? "active" : "archived"}/><button className="button secondary" type="submit">{conversation.status === "archived" ? "Restore" : "Archive"}</button></form>
        <form className="workspace-form" action={setConversationStatus}><input type="hidden" name="conversation_id" value={id}/><input type="hidden" name="organization_id" value={ws.organizationId}/><input type="hidden" name="status" value="deleted"/><button className="button secondary" type="submit">Delete conversation</button></form>
        <div className="form-note">Agent and model choices are pinned to this conversation and can be changed for the next request.</div>
        {messagesError ? <p className="form-error">Message history could not be loaded.</p> : <p className="form-note">{initialMessages.length} saved messages · updated {new Date(conversation.updated_at).toLocaleString("en-GB")}</p>}
      </article>
      <MockChat organizationId={ws.organizationId} conversationId={id} projectId={conversation.project_id} projects={projects ?? []} initialMessages={initialMessages} agentProfiles={agentProfiles} initialAgentProfileId={conversation.agent_profile_id} availableModels={availableModels} initialModelSelectionMode={conversation.model_selection_mode ?? "auto"} initialSelectedModelAlias={conversation.selected_model_alias}/>
    </section>
  </div>;
}
