import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin/guard";
import { cancelQueuedJob, markWaitlistInvited, retryFailedJob, setFeatureFlag, setOrganizationStatus } from "../actions";
import { setModelEnabled } from "../ai-control-actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SectionConfig = {
  title: string;
  description: string;
  schema: string;
  table: string;
  fields: string[];
  order?: string;
  searchField?: string;
  statusField?: string;
  statuses?: string[];
};

const sections: Record<string, SectionConfig> = {
  waitlist: { title: "Waitlist", description: "Every beta signup, verification state, source and invitation state.", schema: "launch", table: "waitlist_entries", fields: ["email","name","company","source","status","email_verified_at","created_at"], order: "created_at", searchField: "email", statusField: "status", statuses: ["pending_verification","verified","invited","converted"] },
  organizations: { title: "Organizations", description: "Customer workspaces, lifecycle state and ownership boundaries.", schema: "app", table: "organizations", fields: ["name","slug","status","created_at","updated_at"], order: "created_at", searchField: "name", statusField: "status", statuses: ["active","paused","archived"] },
  inference: { title: "AI requests", description: "Routing, user-selected mode, token use, latency and cost for every generation request.", schema: "ai", table: "generation_requests", fields: ["requested_role","task_type","model_selection_mode","requested_model_alias","chosen_model_alias","status","input_tokens","output_tokens","cost","created_at"], order: "created_at", searchField: "requested_role", statusField: "status" },
  agents: { title: "Agent runs", description: "Agent objectives, execution state, profile binding, budgets and tracked totals.", schema: "ai", table: "agent_runs", fields: ["objective","state","agent_profile_id","model_selection_mode","model_alias","current_step","total_tokens","total_tool_calls","total_cost","created_at"], order: "created_at", searchField: "objective", statusField: "state" },
  jobs: { title: "Jobs", description: "Background queues, retries, leases and failures across the platform.", schema: "operations", table: "jobs", fields: ["queue_name","status","attempt_count","max_attempts","available_at","lease_owner","created_at"], order: "created_at", searchField: "queue_name", statusField: "status", statuses: ["queued","leased","running","succeeded","failed","cancelled","dead_letter"] },
  usage: { title: "Usage & cost", description: "Organization-level tracked consumption and cost aggregates.", schema: "usage", table: "usage_monthly", fields: ["organization_id","month_start","metric","quantity","cost","updated_at"], order: "month_start", searchField: "metric" },
  findings: { title: "Findings", description: "Security findings across every organization and engagement.", schema: "security", table: "findings", fields: ["title","severity","status","confidence","affected_asset","category","created_at"], order: "created_at", searchField: "title", statusField: "status" },
  reports: { title: "Reports", description: "Report inventory, project association and publication lifecycle.", schema: "reports", table: "reports", fields: ["title","status","organization_id","project_id","created_at","updated_at"], order: "created_at", searchField: "title", statusField: "status" },
  security: { title: "Approvals", description: "Human approval gates for sensitive operations.", schema: "security", table: "approval_requests", fields: ["operation_type","reason","status","organization_id","requested_at","reviewed_at","expires_at"], order: "requested_at", searchField: "operation_type", statusField: "status", statuses: ["pending","approved","rejected","cancelled","expired"] },
  audit: { title: "Audit log", description: "Append-oriented history of sensitive user, security and administrative actions.", schema: "audit", table: "audit_logs", fields: ["action","actor_type","resource_type","resource_id","request_id","created_at"], order: "created_at", searchField: "action" },
  "feature-flags": { title: "Feature flags", description: "Controlled product rollout switches. Changes are audit logged.", schema: "operations", table: "feature_flags", fields: ["key","scope_type","scope_id","enabled","updated_at"], order: "updated_at", searchField: "key" },
  models: { title: "Model registry", description: "Internal model aliases and readiness state. Enablement requires a validated version and healthy deployment.", schema: "ai", table: "models", fields: ["alias","role","description","enabled","updated_at"], order: "updated_at", searchField: "alias" },
  deployments: { title: "Deployments", description: "GPU deployment inventory, health and capacity state.", schema: "ai", table: "model_deployments", fields: ["environment","gpu_provider","gpu_type","gpu_count","status","max_concurrency","cost_per_gpu_hour","last_health_at"], order: "updated_at", searchField: "environment", statusField: "status" },
  memory: { title: "Memory", description: "Saved context with explicit source trust, sensitivity and instruction authority. External content never becomes a higher-priority instruction by storage alone.", schema: "ai", table: "memory_items", fields: ["scope","source_type","trust_level","sensitivity","instruction_authority","confidence","validation_status","expires_at","created_at"], order: "created_at", searchField: "source_type", statusField: "validation_status" },
  learning: { title: "Learning", description: "Improvement candidates derived from evidence. Promotion is separate from production execution.", schema: "ai", table: "learning_candidates", fields: ["candidate_type","status","summary","consent_state","organization_id","source_agent_run_id","created_at"], order: "created_at", searchField: "summary", statusField: "status", statuses: ["candidate","evaluating","rejected","approved","shadow","canary","promoted","rolled_back"] },
  evaluations: { title: "Model evaluations", description: "Controlled evaluation evidence for model versions before promotion.", schema: "ai", table: "model_evaluations", fields: ["suite_id","suite_version","environment","status","score","model_version_id","started_at","completed_at","created_at"], order: "created_at", searchField: "suite_id", statusField: "status" },
  rollouts: { title: "Canary & rollback", description: "Rollout metadata from candidate and shadow through canary percentages, production and rollback.", schema: "ai", table: "rollouts", fields: ["target_type","target_id","target_version","phase","traffic_percent","status","rollback_target","started_at","completed_at"], order: "created_at", searchField: "target_id", statusField: "status", statuses: ["planned","running","paused","completed","failed","rolled_back"] },
  engagements: { title: "Security engagements", description: "Authorized assessment containers with network posture, dates and engagement lifecycle.", schema: "security", table: "engagements", fields: ["name","type","status","network_access","organization_id","project_id","starts_at","ends_at","updated_at"], order: "updated_at", searchField: "name", statusField: "status", statuses: ["draft","ready","active","paused","completed","cancelled"] },
  sandboxes: { title: "Sandboxes", description: "Ephemeral execution jobs with pinned images, resource limits and explicit egress policy.", schema: "operations", table: "sandbox_jobs", fields: ["sandbox_identity","status","image_version","image_digest","cpu_limit_millis","memory_limit_mb","timeout_seconds","egress_policy","started_at","destroyed_at","created_at"], order: "created_at", searchField: "sandbox_identity", statusField: "status" },
};

function render(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  const normalized = raw.replaceAll("_", " ");
  return normalized.length > 90 ? `${normalized.slice(0, 89)}…` : normalized;
}

function isDateField(field: string) {
  return field.endsWith("_at") || field === "month_start";
}

function niceDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.valueOf())) return render(value);
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function statusClass(value: unknown) {
  const v = String(value ?? "").toLowerCase();
  if (["verified","active","completed","succeeded","approved","converted","enabled","promoted","production","passed"].includes(v)) return "good";
  if (["pending","pending_verification","queued","running","leased","invited","reviewing","candidate","evaluating","shadow","canary","paused","planned"].includes(v)) return "warn";
  if (["failed","dead_letter","rejected","cancelled","disabled","rolled_back"].includes(v)) return "bad";
  return "neutral";
}

export default async function AdminSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  const config = sections[section];
  if (!config) notFound();

  const search = await searchParams;
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 120) : "";
  const status = typeof search.status === "string" ? search.status : "";
  const requestedPage = typeof search.page === "string" ? Number.parseInt(search.page, 10) : 1;
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const { admin } = await requireSuperadmin();
  let query = admin.schema(config.schema).from(config.table).select("*", { count: "exact" });
  if (q && config.searchField) query = query.ilike(config.searchField, `%${q.replaceAll("%", "").replaceAll("_", " ")}%`);
  if (status && config.statusField) query = query.eq(config.statusField, status);
  if (config.order) query = query.order(config.order, { ascending: false });
  const result = await query.range(offset, offset + PAGE_SIZE - 1);
  if (result.error) throw result.error;

  const rows = (result.data ?? []) as Array<Record<string, unknown>>;
  const count = result.count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hasActions = ["waitlist","organizations","jobs","feature-flags","models"].includes(section);

  return (
    <div className="admin-page">
      <div className="admin-heading">
        <div className="admin-heading-copy"><div className="admin-eyebrow">VEXONYX / SUPERADMIN</div><h1>{config.title}</h1><p>{config.description}</p></div>
        <div className="admin-heading-actions"><Link className="admin-button" href={section === "models" || ["memory","learning","evaluations","rollouts"].includes(section) ? "/admin/ai" : "/admin"}>{section === "models" || ["memory","learning","evaluations","rollouts"].includes(section) ? "AI Control Center" : "Command center"}</Link></div>
      </div>

      <form className="admin-toolbar" method="get">
        <div className="admin-toolbar-left">
          {config.searchField ? <input className="admin-input" name="q" defaultValue={q} placeholder={`Search ${config.title.toLowerCase()}…`} /> : null}
          {config.statusField && config.statuses ? <select className="admin-select" name="status" defaultValue={status}><option value="">All statuses</option>{config.statuses.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}</select> : null}
          <button className="admin-button" type="submit">Filter</button>
          {(q || status) ? <Link className="admin-button" href={`/admin/${section}`}>Clear</Link> : null}
        </div>
        <div className="admin-toolbar-right"><span className="admin-count">{count.toLocaleString()} records</span></div>
      </form>

      <section className="admin-card">
        {rows.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr>{config.fields.map((field) => <th key={field}>{field.replaceAll("_", " ")}</th>)}{hasActions ? <th>Actions</th> : null}</tr></thead>
              <tbody>{rows.map((row, index) => {
                const rowId = String(row.id ?? `${section}-${page}-${index}`);
                return <tr key={rowId}>
                  {config.fields.map((field, fieldIndex) => <td key={field}>{fieldIndex === 0 ? <b>{isDateField(field) ? niceDate(row[field]) : render(row[field])}</b> : config.statusField === field ? <span className={`admin-status ${statusClass(row[field])}`}>{render(row[field])}</span> : isDateField(field) ? niceDate(row[field]) : render(row[field])}</td>)}
                  {section === "waitlist" ? <td>{row.status === "verified" ? <form action={markWaitlistInvited}><input type="hidden" name="entry_id" value={String(row.id)} /><button className="admin-button primary" type="submit">Mark invited</button></form> : <span className="admin-count">—</span>}</td> : null}
                  {section === "organizations" ? <td><form className="admin-form-inline" action={setOrganizationStatus}><input type="hidden" name="organization_id" value={String(row.id)} /><select className="admin-select" name="status" defaultValue={String(row.status)}><option value="active">active</option><option value="paused">paused</option><option value="archived">archived</option></select><button className="admin-button" type="submit">Save</button></form></td> : null}
                  {section === "jobs" ? <td><div className="admin-action-row">{["failed","dead_letter"].includes(String(row.status)) ? <form action={retryFailedJob}><input type="hidden" name="job_id" value={String(row.id)} /><button className="admin-button" type="submit">Retry</button></form> : null}{row.status === "queued" ? <form action={cancelQueuedJob}><input type="hidden" name="job_id" value={String(row.id)} /><button className="admin-button danger" type="submit">Cancel</button></form> : null}</div></td> : null}
                  {section === "feature-flags" ? <td><form action={setFeatureFlag}><input type="hidden" name="flag_id" value={String(row.id)} /><input type="hidden" name="enabled" value={row.enabled ? "false" : "true"} /><button className={`admin-button ${row.enabled ? "danger" : "primary"}`} type="submit">{row.enabled ? "Disable" : "Enable"}</button></form></td> : null}
                  {section === "models" ? <td><form action={setModelEnabled}><input type="hidden" name="model_id" value={String(row.id)} /><input type="hidden" name="enabled" value={row.enabled ? "false" : "true"} /><button className={`admin-button ${row.enabled ? "danger" : "primary"}`} type="submit">{row.enabled ? "Disable" : "Enable when ready"}</button></form></td> : null}
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : <div className="admin-empty"><b>No matching records</b>Try changing your search or filters.</div>}
        <div className="admin-pagination"><span>Page {page} of {totalPages}</span><div>{page > 1 ? <Link className="admin-button" href={{ pathname: `/admin/${section}`, query: { ...(q ? { q } : {}), ...(status ? { status } : {}), page: page - 1 } }}>← Previous</Link> : null}{page < totalPages ? <Link className="admin-button" href={{ pathname: `/admin/${section}`, query: { ...(q ? { q } : {}), ...(status ? { status } : {}), page: page + 1 } }}>Next →</Link> : null}</div></div>
      </section>
    </div>
  );
}
