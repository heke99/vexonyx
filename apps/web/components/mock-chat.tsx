"use client";

import { FormEvent, useState } from "react";

type Event = { state: string; message: string };

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

export function MockChat() {
  const [events,setEvents] = useState<Event[]>([]);
  const [running,setRunning] = useState(false);

  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const prompt = String(new FormData(form).get("prompt") ?? "").trim();
    if (!prompt || running) return;
    setRunning(true);
    setEvents([]);

    const res = await fetch("/api/v1/ai/mock", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({prompt}) });
    if (!res.ok || !res.body) {
      setEvents([{state:"FAILED",message:"VEXONYX is temporarily unavailable."}]);
      setRunning(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value,{stream:true});
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        try { setEvents((current) => [...current, JSON.parse(line) as Event]); } catch {}
      }
    }
    setRunning(false);
    form.reset();
  }

  return <div className="workspace-card">
    <header><h2>VEXONYX</h2><span>{running ? "Working" : "Ready"}</span></header>
    <div style={{minHeight:230,paddingTop:14}}>
      {events.length ? events.map((event,i) => <div className="project-row" key={`${event.state}-${i}`}><div><b>{stateLabels[event.state] ?? "Working"}</b><small>{event.message}</small></div><span>{i === events.length - 1 && running ? "●" : "✓"}</span></div>) : <div className="empty-state"><div><b>Your chat workspace is ready.</b><p>Use this preview to verify conversation flow and project context before private AI is connected.</p></div></div>}
    </div>
    <form className="workspace-form" onSubmit={submit}><input name="prompt" maxLength={1000} required placeholder="Ask VEXONYX about your security project…"/><button className="button" disabled={running} type="submit">{running ? "Working…" : "Send"}</button></form>
  </div>;
}
