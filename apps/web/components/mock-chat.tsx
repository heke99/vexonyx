"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Event = { type?:string; state?:string; message?:string; role?:string; conversationId?:string; generationRequestId?:string };
type ChatMessage = { id:string; role:"user"|"assistant"; text:string; createdAt:string };
type ProjectOption = { id:string; name:string };
type AgentOption = { id:string; name:string };
type ModelOption = { alias:string; role:string; description?:string|null };
type ModelMode = "auto"|"fast"|"pro"|"deep"|"specific";

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

function initialModelChoice(mode?:string,alias?:string|null) {
  return mode === "specific" && alias ? `specific:${alias}` : (["auto","fast","pro","deep"].includes(mode ?? "") ? mode! : "auto");
}

export function MockChat({
  organizationId,
  conversationId: initialConversationId,
  projectId: initialProjectId,
  projects = [],
  initialMessages = [],
  agentProfiles = [],
  initialAgentProfileId,
  availableModels = [],
  initialModelSelectionMode = "auto",
  initialSelectedModelAlias,
}: {
  organizationId:string;
  conversationId?:string;
  projectId?:string|null;
  projects?:ProjectOption[];
  initialMessages?:ChatMessage[];
  agentProfiles?:AgentOption[];
  initialAgentProfileId?:string|null;
  availableModels?:ModelOption[];
  initialModelSelectionMode?:string;
  initialSelectedModelAlias?:string|null;
}) {
  const [events,setEvents] = useState<Event[]>([]);
  const [messages,setMessages] = useState<ChatMessage[]>(initialMessages);
  const [running,setRunning] = useState(false);
  const [conversationId,setConversationId] = useState(initialConversationId ?? "");
  const [projectId,setProjectId] = useState(initialProjectId ?? "");
  const [agentProfileId,setAgentProfileId] = useState(initialAgentProfileId ?? "");
  const [modelChoice,setModelChoice] = useState(initialModelChoice(initialModelSelectionMode,initialSelectedModelAlias));
  const router = useRouter();

  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const prompt = String(new FormData(form).get("prompt") ?? "").trim();
    if (!prompt || running) return;
    const key = crypto.randomUUID();
    const optimisticId = `local-${key}`;
    const specific = modelChoice.startsWith("specific:");
    const mode = (specific ? "specific" : modelChoice) as ModelMode;
    const selectedModelAlias = specific ? modelChoice.slice("specific:".length) : undefined;
    setRunning(true);
    setEvents([]);
    setMessages((current)=>[...current,{id:optimisticId,role:"user",text:prompt,createdAt:new Date().toISOString()}]);
    form.reset();

    const res = await fetch("/api/v1/ai/mock", {
      method:"POST",
      headers:{"content-type":"application/json","idempotency-key":key},
      body:JSON.stringify({
        prompt,
        organizationId,
        conversationId:conversationId || undefined,
        projectId:projectId || undefined,
        agentProfileId:agentProfileId || undefined,
        modelSelectionMode:mode,
        selectedModelAlias,
      }),
    });
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
    <div className="workspace-form" style={{paddingTop:14,alignItems:"end",flexWrap:"wrap"}}>
      <label style={{display:"grid",gap:6,minWidth:210}}><small>Agent</small><select value={agentProfileId} onChange={(event)=>setAgentProfileId(event.target.value)} disabled={running}><option value="">VEXONYX default</option>{agentProfiles.map((agent)=><option value={agent.id} key={agent.id}>{agent.name}</option>)}</select></label>
      <label style={{display:"grid",gap:6,minWidth:210}}><small>Model</small><select value={modelChoice} onChange={(event)=>setModelChoice(event.target.value)} disabled={running}><option value="auto">VEXONYX Auto</option><option value="fast">VEXONYX Fast</option><option value="pro">VEXONYX Pro</option><option value="deep">VEXONYX Deep</option>{availableModels.length ? <optgroup label="Advanced · specific models">{availableModels.map((model)=><option value={`specific:${model.alias}`} key={model.alias}>{model.alias} · {model.role}</option>)}</optgroup> : null}</select></label>
      {!conversationId && projects.length ? <label style={{display:"grid",gap:6,minWidth:210}}><small>Project context</small><select value={projectId} onChange={(event)=>setProjectId(event.target.value)} disabled={running}><option value="">No project</option>{projects.map((project)=><option value={project.id} key={project.id}>{project.name}</option>)}</select></label> : null}
    </div>
    <div className="form-note" style={{paddingTop:8}}>Specific model aliases appear only when the model is enabled and your organization or plan is entitled to use it.</div>
    <div style={{minHeight:280,paddingTop:14}}>
      {messages.length ? messages.map((message)=><div className="project-row" key={message.id}><div><small>{message.role === "assistant" ? "VEXONYX" : "YOU"}</small><b style={{whiteSpace:"pre-wrap"}}>{message.text}</b></div><span>{new Date(message.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span></div>) : <div className="empty-state"><div><b>Your chat workspace is ready.</b><p>Agent profile, model-routing mode, messages and usage are persisted before private AI is connected.</p></div></div>}
      {events.length ? <div style={{marginTop:12}}>{events.slice(-3).map((event,i) => <div className="project-row" key={`${event.state}-${i}`}><div><b>{stateLabels[event.state ?? ""] ?? "Working"}</b><small>{event.message}</small></div><span>{i === events.slice(-3).length - 1 && running ? "●" : "✓"}</span></div>)}</div> : null}
    </div>
    <form className="workspace-form" onSubmit={submit}><input name="prompt" maxLength={4000} required placeholder="Ask VEXONYX about your security project…"/><button className="button" disabled={running} type="submit">{running ? "Working…" : "Send"}</button></form>
  </div>;
}
