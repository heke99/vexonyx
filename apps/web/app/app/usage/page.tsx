import { getWorkspace } from "@/lib/workspace";

const labels: Record<string,string> = {
  input_tokens: "Input tokens",
  output_tokens: "Output tokens",
  generations: "AI generations",
  agent_runs: "Agent runs",
  tool_runs: "Tool runs",
  sandbox_seconds: "Execution seconds",
  gpu_seconds: "GPU seconds",
  storage_bytes: "Storage",
  file_processing: "Files processed",
  embedding: "Embeddings",
  api_requests: "API requests",
  report_exports: "Report exports",
};

function quantity(metric: string, value: unknown) {
  const number = Number(value ?? 0);
  if (metric === "storage_bytes") {
    if (number < 1024) return `${number} B`;
    if (number < 1024 ** 2) return `${(number / 1024).toFixed(1)} KB`;
    if (number < 1024 ** 3) return `${(number / 1024 ** 2).toFixed(1)} MB`;
    return `${(number / 1024 ** 3).toFixed(1)} GB`;
  }
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(number);
}

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const month = new Date();
  month.setUTCDate(1);
  month.setUTCHours(0, 0, 0, 0);
  const monthStart = month.toISOString().slice(0, 10);

  const [usage, creditUsage, account] = await Promise.all([
    ws.supabase
      .schema("usage")
      .from("usage_user_monthly")
      .select("metric,quantity,updated_at")
      .eq("organization_id", ws.organizationId)
      .eq("user_id", ws.userId)
      .eq("month_start", monthStart)
      .order("metric"),
    ws.supabase
      .schema("usage")
      .from("credit_user_monthly")
      .select("credits_consumed")
      .eq("organization_id", ws.organizationId)
      .eq("user_id", ws.userId)
      .eq("month_start", monthStart)
      .maybeSingle(),
    ws.supabase
      .schema("billing")
      .from("credit_accounts")
      .select("balance")
      .eq("organization_id", ws.organizationId)
      .maybeSingle(),
  ]);

  const creditsUsed = Number(creditUsage.data?.credits_consumed ?? 0);
  const gpuUsage = usage.data?.find((item) => item.metric === "gpu_seconds");
  const hasError = Boolean(usage.error || creditUsage.error);

  return <div className="app-content">
    <div className="app-heading"><div><h1>Your usage</h1><p>Your personal AI, agent, tool, file and execution usage for this workspace. Usage is attributed to the user who created it; the credit balance remains shared by the workspace.</p></div></div>
    <section className="metric-grid">
      <div className="metric"><span>Credits used this month</span><strong>{creditsUsed.toLocaleString()}</strong></div>
      <div className="metric"><span>GPU usage</span><strong>{gpuUsage ? quantity("gpu_seconds", gpuUsage.quantity) : "0"}</strong></div>
      <div className="metric"><span>Shared credits available</span><strong>{Number(account.data?.balance ?? 0).toLocaleString()}</strong></div>
    </section>
    <section className="workspace-card"><header><h2>Your current month</h2><span>{monthStart}</span></header>
      {hasError ? <div className="empty-state"><div><b>Your usage could not be loaded.</b><p>Try again. No usage or credit records have been changed.</p></div></div> : usage.data?.length ? usage.data.map((item) => <div className="project-row" key={item.metric}><div><b>{labels[item.metric] ?? item.metric.replaceAll("_", " ")}</b><small>Updated {new Date(item.updated_at).toLocaleString("en-GB")}</small></div><span>{quantity(item.metric, item.quantity)}</span></div>) : <div className="empty-state"><div><b>No measured usage this month.</b><p>Your usage will appear here as you use workspace features. GPU usage remains zero before model deployment.</p></div></div>}
    </section>
  </div>;
}
