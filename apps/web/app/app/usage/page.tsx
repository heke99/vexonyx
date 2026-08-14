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
  month.setUTCDate(1); month.setUTCHours(0,0,0,0);
  const monthStart = month.toISOString().slice(0,10);
  const { data, error } = await ws.supabase.schema("usage").from("usage_monthly").select("metric,quantity,cost,updated_at").eq("organization_id", ws.organizationId).eq("month_start", monthStart).order("metric");
  const totalCost = data?.reduce((sum, item) => sum + Number(item.cost ?? 0), 0) ?? 0;

  return <div className="app-content">
    <div className="app-heading"><div><h1>Usage</h1><p>See how your organization uses AI, files, reports and execution resources. Usage always follows the account that created it.</p></div></div>
    <section className="metric-grid"><div className="metric"><span>This month</span><strong>{data?.length ?? 0}</strong></div><div className="metric"><span>Tracked cost</span><strong>{totalCost.toFixed(2)}</strong></div><div className="metric"><span>GPU usage</span><strong>{data?.find((x) => x.metric === "gpu_seconds") ? quantity("gpu_seconds", data.find((x) => x.metric === "gpu_seconds")?.quantity) : "0"}</strong></div></section>
    <section className="workspace-card"><header><h2>Current month</h2><span>{monthStart}</span></header>
      {error ? <div className="empty-state"><div><b>Usage could not be loaded.</b><p>Try again. No usage records have been changed.</p></div></div> : data?.length ? data.map((item) => <div className="project-row" key={item.metric}><div><b>{labels[item.metric] ?? item.metric.replaceAll("_", " ")}</b><small>Updated {new Date(item.updated_at).toLocaleString("en-GB")}</small></div><span>{quantity(item.metric, item.quantity)}</span></div>) : <div className="empty-state"><div><b>No measured usage this month.</b><p>Usage will appear here as workspace features are used. GPU usage remains zero before model deployment.</p></div></div>}
    </section>
  </div>;
}
