import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inspectPrivateFile, ISOLATED_PARSER_VERSION, MAX_UPLOAD_BYTES } from "@/lib/files/safe-processing";
import { isAuthorizedWorkerRequest } from "@/lib/workers/internal-auth";

export const maxDuration = 300;

export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "worker_unavailable" }, { status: 503 });
  if (!(await isAuthorizedWorkerRequest(request, admin))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const workerId = `fileproc-${randomUUID()}`;
  const claimed = await admin.schema("operations").rpc("claim_jobs", {
    p_queue_name: "file-processing",
    p_worker_id: workerId,
    p_limit: 3,
    p_lease_seconds: 240,
  });
  if (claimed.error) return NextResponse.json({ error: "queue_claim_failed" }, { status: 500 });

  const results: Array<Record<string, unknown>> = [];
  for (const job of claimed.data ?? []) {
    const jobId = String(job.job_id);
    const organizationId = String(job.organization_id || "");
    const leaseGeneration = Number(job.lease_generation);
    const payload = job.payload && typeof job.payload === "object" ? job.payload as Record<string, unknown> : {};
    const fileId = String(payload.fileId || "");
    if (!fileId || !organizationId || !Number.isSafeInteger(leaseGeneration)) {
      await admin.schema("operations").rpc("finish_job", { p_job_id: jobId, p_worker_id: workerId, p_lease_generation: leaseGeneration, p_success: false, p_error: { code: "invalid_file_job_payload" } });
      results.push({ jobId, status: "failed", reason: "invalid_file_job_payload" });
      continue;
    }

    const started = await admin.schema("operations").rpc("start_job", { p_job_id: jobId, p_worker_id: workerId, p_lease_generation: leaseGeneration });
    if (started.error || started.data !== true) continue;

    try {
      const fileQuery = await admin.schema("artifacts").from("files")
        .select("id,organization_id,project_id,uploaded_by,storage_bucket,storage_path,original_name,declared_mime_type,size_bytes,status,deleted_at")
        .eq("id", fileId).eq("organization_id", organizationId).maybeSingle();
      if (fileQuery.error || !fileQuery.data || fileQuery.data.deleted_at) throw new Error("file_not_found");
      const file = fileQuery.data;

      if (["ready", "blocked"].includes(String(file.status))) {
        await admin.schema("operations").rpc("finish_job", { p_job_id: jobId, p_worker_id: workerId, p_lease_generation: leaseGeneration, p_success: true, p_error: null });
        results.push({ jobId, fileId, status: file.status, idempotent: true });
        continue;
      }
      if (String(file.status) === "safe_for_processing") {
        const parser = await admin.schema("artifacts").from("parser_jobs").select("id,status").eq("file_id", fileId).eq("parser_version", ISOLATED_PARSER_VERSION).maybeSingle();
        if (parser.data) {
          await admin.schema("operations").rpc("finish_job", { p_job_id: jobId, p_worker_id: workerId, p_lease_generation: leaseGeneration, p_success: true, p_error: null });
          results.push({ jobId, fileId, status: "parser_queued", parserJobId: parser.data.id, idempotent: true });
          continue;
        }
      }

      const sizeBytes = Number(file.size_bytes);
      if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) throw new Error("file_size_invalid");
      await admin.schema("artifacts").from("files").update({ status: "scanning", updated_at: new Date().toISOString() }).eq("id", fileId).eq("organization_id", organizationId);

      const downloaded = await admin.storage.from(String(file.storage_bucket)).download(String(file.storage_path));
      if (downloaded.error || !downloaded.data) throw new Error("private_file_download_failed");
      const buffer = new Uint8Array(await downloaded.data.arrayBuffer());
      if (buffer.byteLength > MAX_UPLOAD_BYTES) throw new Error("file_too_large");

      const inspected = inspectPrivateFile({
        buffer,
        originalName: String(file.original_name),
        declaredMimeType: file.declared_mime_type ? String(file.declared_mime_type) : null,
        expectedSizeBytes: sizeBytes,
      });

      const decision = inspected.decision === "ready_text" ? "ready_text"
        : inspected.decision === "safe_nontext" ? "safe_nontext"
        : inspected.decision === "isolated_parser" ? "isolated_parser"
        : "blocked";
      const chunks = inspected.decision === "ready_text" ? inspected.chunks : [];
      const applied = await admin.schema("artifacts").rpc("apply_file_inspection_result", {
        p_file_id: fileId,
        p_organization_id: organizationId,
        p_decision: decision,
        p_reason: inspected.reason,
        p_content_hash: inspected.contentHash,
        p_detected_mime_type: inspected.detectedMimeType,
        p_mode: inspected.decision === "ready_text" ? "text" : inspected.decision === "safe_nontext" ? "nontext" : null,
        p_chunks: chunks,
        p_parser_version: ISOLATED_PARSER_VERSION,
        p_requested_by: file.uploaded_by,
      });
      if (applied.error) throw applied.error;

      const finished = await admin.schema("operations").rpc("finish_job", { p_job_id: jobId, p_worker_id: workerId, p_lease_generation: leaseGeneration, p_success: true, p_error: null });
      if (finished.error || finished.data !== true) throw new Error("file_job_finish_failed");
      results.push({ jobId, fileId, status: decision, parserJobId: applied.data || null });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 180) : "file_processing_failed";
      await admin.schema("artifacts").from("files").update({ status: "quarantined", updated_at: new Date().toISOString() }).eq("id", fileId).eq("organization_id", organizationId).eq("status", "scanning");
      await admin.schema("operations").rpc("finish_job", { p_job_id: jobId, p_worker_id: workerId, p_lease_generation: leaseGeneration, p_success: false, p_error: { code: reason } });
      results.push({ jobId, fileId, status: "failed", reason });
    }
  }

  return NextResponse.json({ processed: results.length, results }, { headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) { return POST(request); }
