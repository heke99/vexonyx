import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedWorkerRequest } from "@/lib/workers/internal-auth";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
const EXPORT_BUCKET = "admin-exports";
const CANARY_MARKER = "VEXONYX_EXPORT_CANARY";

function csvCell(value: unknown) {
  const stringValue = String(value ?? "");
  return `"${stringValue.replaceAll('"', '""')}"`;
}
function csv(rows: Record<string, unknown>[], columns: string[]) {
  return [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
}

async function maybeRunExportCanary(admin: AdminClient) {
  if (process.env.VERCEL_ENV !== "production") return { status: "skipped_nonproduction" };
  const latest = await admin.schema("audit").from("audit_logs").select("created_at,metadata").eq("action", "runtime.marketing_export_canary").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const latestAt = latest.data?.created_at ? new Date(latest.data.created_at).getTime() : 0;
  const latestMeta = latest.data?.metadata && typeof latest.data.metadata === "object" ? latest.data.metadata as Record<string, unknown> : {};
  const previousPassed = latestMeta.status === "passed" && latestMeta.storageRoundTrip === true && latestMeta.cleanupVerified === true;
  const interval = previousPassed ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000;
  if (latestAt && Date.now() - latestAt < interval) return { status: "skipped_recent", previous: latestMeta.status ?? "unknown" };

  const canaryId = `export-${randomUUID()}`;
  const path = `_canary/marketing/${canaryId}.csv`;
  const content = Buffer.from(csv([{ marker: CANARY_MARKER, checked_at: new Date().toISOString() }], ["marker", "checked_at"]), "utf8");
  let cleanupVerified = false;
  try {
    const upload = await admin.storage.from(EXPORT_BUCKET).upload(path, content, { contentType: "text/csv", cacheControl: "private, max-age=0", upsert: false });
    if (upload.error) throw upload.error;
    const download = await admin.storage.from(EXPORT_BUCKET).download(path);
    if (download.error || !download.data) throw download.error ?? new Error("marketing_export_canary_download_failed");
    const downloaded = Buffer.from(await download.data.arrayBuffer());
    const storageRoundTrip = downloaded.equals(content) && downloaded.toString("utf8").includes(CANARY_MARKER);
    if (!storageRoundTrip) throw new Error("marketing_export_canary_roundtrip_mismatch");
    const removed = await admin.storage.from(EXPORT_BUCKET).remove([path]);
    if (removed.error) throw removed.error;
    cleanupVerified = true;
    const metadata = { status: "passed", storageRoundTrip: true, cleanupVerified, bytes: content.byteLength, checkedAt: new Date().toISOString() };
    await admin.schema("audit").from("audit_logs").insert({ actor_type: "system", action: "runtime.marketing_export_canary", resource_type: "marketing_export", request_id: canaryId, metadata });
    return metadata;
  } catch (error) {
    if (!cleanupVerified) {
      const removed = await admin.storage.from(EXPORT_BUCKET).remove([path]);
      cleanupVerified = !removed.error;
    }
    const metadata = { status: "failed", storageRoundTrip: false, cleanupVerified, reason: error instanceof Error ? error.message.slice(0, 300) : "marketing_export_canary_failed", checkedAt: new Date().toISOString() };
    await admin.schema("audit").from("audit_logs").insert({ actor_type: "system", action: "runtime.marketing_export_canary", resource_type: "marketing_export", request_id: canaryId, metadata });
    console.error("marketing_export_canary_failed", metadata);
    return metadata;
  }
}

export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "worker_unavailable" }, { status: 503 });
  if (!(await isAuthorizedWorkerRequest(request, admin))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const workerId = `marketing-${randomUUID()}`;
  const claimed = await admin.schema("operations").rpc("claim_jobs", { p_queue_name: "marketing", p_worker_id: workerId, p_limit: 5, p_lease_seconds: 300 });
  if (claimed.error) return NextResponse.json({ error: "marketing_queue_claim_failed" }, { status: 500 });

  const results: Array<Record<string, unknown>> = [];
  for (const job of claimed.data ?? []) {
    const jobId = String(job.job_id);
    const generation = Number(job.lease_generation);
    const attempt = Number(job.attempt);
    const payload = job.payload && typeof job.payload === "object" ? job.payload as Record<string, unknown> : {};
    const exportId = String(payload.export_id || "");
    if (payload.job_type !== "marketing_export" || !exportId) {
      await admin.schema("operations").rpc("finish_job", { p_job_id: jobId, p_worker_id: workerId, p_lease_generation: generation, p_success: false, p_error: { code: "invalid_marketing_export_payload" } });
      results.push({ jobId, status: "failed", reason: "invalid_payload" });
      continue;
    }
    const started = await admin.schema("operations").rpc("start_job", { p_job_id: jobId, p_worker_id: workerId, p_lease_generation: generation });
    if (started.error || started.data !== true) continue;

    try {
      const exportRow = await admin.schema("marketing").from("exports").select("id,export_type,filters,status").eq("id", exportId).maybeSingle();
      if (exportRow.error || !exportRow.data) throw new Error("marketing_export_not_found");
      if (exportRow.data.status === "ready") {
        await admin.schema("operations").rpc("finish_job", { p_job_id: jobId, p_worker_id: workerId, p_lease_generation: generation, p_success: true, p_error: null });
        results.push({ id: exportId, status: "ready", idempotent: true });
        continue;
      }
      const running = await admin.schema("marketing").from("exports").update({ status: "running", error_code: null, completed_at: null }).eq("id", exportId);
      if (running.error) throw running.error;

      let rows: Record<string, unknown>[] = [];
      let columns: string[] = [];
      if (exportRow.data.export_type === "waitlist") {
        const query = await admin.schema("launch").from("waitlist_entries").select("email,name,company,job_role,country,source,status,email_verified_at,invited_at,created_at").order("created_at");
        if (query.error) throw query.error;
        rows = (query.data ?? []) as Record<string, unknown>[];
        columns = ["email", "name", "company", "job_role", "country", "source", "status", "email_verified_at", "invited_at", "created_at"];
      } else if (exportRow.data.export_type === "users") {
        const query = await admin.schema("app").rpc("superadmin_user_directory", { p_query: null, p_limit: 100000, p_offset: 0 });
        if (query.error) throw query.error;
        rows = (query.data ?? []) as Record<string, unknown>[];
        columns = ["id", "email", "display_name", "is_superadmin", "organization_count", "account_created_at", "last_sign_in_at", "is_suspended"];
      } else if (exportRow.data.export_type === "customers") {
        const query = await admin.schema("billing").from("billing_customers").select("organization_id,billing_email,tax_country,provider,provider_customer_id,created_at,updated_at").order("created_at");
        if (query.error) throw query.error;
        rows = (query.data ?? []) as Record<string, unknown>[];
        columns = ["organization_id", "billing_email", "tax_country", "provider", "provider_customer_id", "created_at", "updated_at"];
      } else if (exportRow.data.export_type === "audience") {
        const query = await admin.schema("marketing").from("audience_members").select("email,name,company,lifecycle_stage,marketing_consent,marketing_consent_at,unsubscribed_at,source,created_at").order("created_at");
        if (query.error) throw query.error;
        rows = (query.data ?? []) as Record<string, unknown>[];
        columns = ["email", "name", "company", "lifecycle_stage", "marketing_consent", "marketing_consent_at", "unsubscribed_at", "source", "created_at"];
      } else {
        throw new Error("unsupported_export_type");
      }

      const content = Buffer.from(csv(rows, columns), "utf8");
      const path = `exports/${exportId}.csv`;
      const upload = await admin.storage.from(EXPORT_BUCKET).upload(path, content, { contentType: "text/csv", cacheControl: "private, max-age=0", upsert: true });
      if (upload.error) throw upload.error;
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const done = await admin.schema("marketing").from("exports").update({ status: "ready", storage_path: path, row_count: rows.length, expires_at: expires, completed_at: new Date().toISOString(), error_code: null }).eq("id", exportId);
      if (done.error) throw done.error;
      const finished = await admin.schema("operations").rpc("finish_job", { p_job_id: jobId, p_worker_id: workerId, p_lease_generation: generation, p_success: true, p_error: null });
      if (finished.error || finished.data !== true) throw new Error("marketing_export_lease_lost");
      results.push({ id: exportId, status: "ready", rows: rows.length, attempt });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 120) : "export_failed";
      const failed = await admin.schema("operations").rpc("finish_job", { p_job_id: jobId, p_worker_id: workerId, p_lease_generation: generation, p_success: false, p_error: { code: reason } });
      const terminal = attempt >= 5 || failed.error || failed.data !== true;
      await admin.schema("marketing").from("exports").update({ status: terminal ? "failed" : "queued", error_code: reason, completed_at: terminal ? new Date().toISOString() : null }).eq("id", exportId);
      results.push({ id: exportId, status: terminal ? "failed" : "retry_queued", attempt, reason });
    }
  }

  const canary = results.length === 0 ? await maybeRunExportCanary(admin) : { status: "skipped_busy" };
  return NextResponse.json({ processed: results.length, results, canary }, { headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  return POST(request);
}
