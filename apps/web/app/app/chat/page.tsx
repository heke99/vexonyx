import Link from "next/link";
import { MockChat } from "@/components/mock-chat";
import { getWorkspace } from "@/lib/workspace";

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const [conversations,projects] = await Promise.all([
    ws.supabase.schema("app").from("conversations").select("id,title,status,project_id,updated_at").eq("organization_id",ws.organizationId).eq("user_id",ws.userId).neq("status","deleted").order("updated_at",{ascending:false}).limit(30),
    ws.supabase.schema("app").from("projects").select("id,name").eq("organization_id",ws.organizationId).is("deleted_at",null).order("updated_at",{ascending:false}).limit(100),
  ]);

  return <div className="app-content">
    <div className="app-heading"><div><h1>Chat</h1><p>Persistent conversations keep messages, project context, routing and usage connected across reloads.</p></div></div>
    <section className="workspace-grid">
      <article className="workspace-card"><header><h2>Conversations</h2><span>{conversations.data?.length ?? 0}</span></header>
        {conversations.error ? <div className="empty-state"><div><b>Conversations could not be loaded.</b><p>No messages were changed.</p></div></div> : conversations.data?.length ? conversations.data.map((conversation)=><Link className="project-row" href={`/app/chat/${conversation.id}`} key={conversation.id}><div><b>{conversation.title}</b><small>{conversation.status} · updated {new Date(conversation.updated_at).toLocaleString("en-GB")}</small></div><span>Open →</span></Link>) : <div className="empty-state"><div><b>No conversations yet.</b><p>Start below. The first message creates a persistent conversation.</p></div></div>}
      </article>
      <MockChat organizationId={ws.organizationId} projects={projects.data ?? []}/>
    </section>
  </div>;
}
