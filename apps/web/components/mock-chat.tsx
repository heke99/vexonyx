"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Event = { type?:string; state?:string; message?:string; role?:string; conversationId?:string; generationRequestId?:string };
type ChatMessage = { id:string; role:"user"|"assistant"; text:string; createdAt:string };
type ProjectOption = { id:string; name:string };

const stateLabels: Record<string,string> = {
  QUEUED: "Preparing",
  PLANNING: "Planning",
  CONTEXT_LOADING: "Loading project context",
  MODEL_RUNNING: "Analyzing",
  TOOL_REQUESTED: "Preparing next step",
  SCOPE_VALIDATION: "Checking authorization",
  WAITING_FOR_APPROVAL: "Waiting for approval",
  TOOL_RUNNING: "Running approved step",
  OBSERVATION: "Reviewing result",
  VALIDATING: "Validating",
  WAITING_FOR_USER: "Waiting for you",
  PAUSED_BUDGET_LIMIT: "Paused by limit",
  COMPLETED: "Complete",
  FAILED: "Unable to complete",
  CANCELLED: "Cancelled",
};

export function MockChat({ organizationId, conversationId: initialConversationId, projectId: initialProjectId, projects = [], initialMessages = [] }: { organizationId:string; conversationId?:string; projectId?:string|null; projects?:ProjectOption[]; initialMessages?:ChatMessage[] }) {
  const [events,setEvents] = useState<Event[]>([]);
  const [messages,setMessages] = useState<ChatMessage[]>(initialMessages);
  const [running,setRunning] = useState(false);
  const [conversationId,setConversationId] = useState(initialConversationId ?? "");
  const [projectId,setProjectId] = useState(initialProjectId ?? "");
  const router = useRouter();

  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const prompt = String(new FormData(form).get("prompt") ?? "").trim();
    if (!prompt || running) return;
    const key = crypto.randomUUID();
    const optimisticId = `local-${key}`;
    setRunning(true);
    setEvents([]);
    setMessages((current)=>[...current,{id:optimisticId,role:"user",text:prompt,createdAt:new Date().toISOString()}]);
    form.reset();

    const res = await fetch("/api/v1/ai/mock", { method:"POST", headers:{"content-type":"application/json","idempotency-key":key}, body:JSON.stringify({prompt,organizationId,conversationId:conversationId || undefined,projectId:projectId || undefined}) });
    if (!res.ok || !res.body) {
      setEvents([{type:"state",state:"FAILED",message:"VEXONYX is temporarily unavailable."}]);
      setRunning(false);
      return;
    }

    const responseConversationId = res.headers.get("x-vexonyx-conversation-id") ?? "";
    if (responseConversationId && !conversationId) setConversationId(responseConversationId);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalConversationId = responseConversationId || conversationId;
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value,{stream:true});
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        try {
          const event = JSON.parse(line) as Event;
          if (event.type === "meta" && event.conversationId) {
            finalConversationId = event.conversationId;
            if (!conversationId) setConversationId(event.conversationId);
          } else if (event.type === "message" && event.role === "assistant" && event.message) {
            setMessages((current)=>[...current,{id:`assistant-${key}`,role:"assistant",text:event.message!,createdAt:new Date().toISOString()}]);
          } else if (event.type === "state") {
            setEvents((current) => [...current, event]);
          }
        } catch {}
      }
    }
    setRunning(false);
    if (finalConversationId) {
      if (!initialConversationId) router.replace(`/app/chat/${finalConversationId}`);
      router.refresh();
    }
  }

  return <div className="workspace-card">
    <header><h2>VEXONYX</h2><span>{running ? "Working" : "Ready"}</span></header>
    {!conversationId && projects.length ? <div className="workspace-form" style={{paddingTop:14}}><label style={{display:"grid",gap:6,minWidth:240}}><small>Project context</small><select value={projectId} onChange={(event)=>setProjectId(event.target.value)} disabled={running}><option value="">No project</option>{projects.map((project)=><option value={project.id} key={project.id}>{project.name}</option>)}</select></label></div> : null}
    <div style={{minHeight:280,paddingTop:14}}>
      {messages.length ? messages.map((message)=><div className="project-row" key={message.id}><div><small>{message.role === "assistant" ? "VEXONYX" : "YOU"}</small><b style={{whiteSpace:"pre-wrap"}}>{message.text}</b></div><span>{new Date(message.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span></div>) : <div className="empty-state"><div><b>Your chat workspace is ready.</b><p>Messages, routing and usage are persisted before private AI is connected.</p></div></div>}
      {events.length ? <div style={{marginTop:12}}>{events.slice(-3).map((event,i) => <div className="project-row" key={`${event.state}-${i}`}><div><b>{stateLabels[event.state ?? ""] ?? "Working"}</b><small>{event.message}</small></div><span>{i === events.slice(-3).length - 1 && running ? "●" : "✓"}</span></div>)}</div> : null}
    </div>
    <form className="workspace-form" onSubmit={submit}><input name="prompt" maxLength={4000} required placeholder="Ask VEXONYX about your security project…"/><button className="button" disabled={running} type="submit">{running ? "Working…" : "Send"}</button></form>
  </div>;
}
