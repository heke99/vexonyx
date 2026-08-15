import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkText, MAX_UPLOAD_BYTES } from "@/lib/files/safe-processing";
import { runVercelIsolatedParser } from "@/lib/sandbox/vercel-isolated-parser";
import { isAuthorizedWorkerRequest } from "@/lib/workers/internal-auth";

export const maxDuration = 300;

const CANARY_MARKER = "VEXONYX_SANDBOX_CANARY";
const CANARY_PDF = new TextEncoder().encode(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >> endobj\n4 0 obj << /Length 45 >> stream\nBT /F1 12 Tf 10 100 Td (${CANARY_MARKER}) Tj ET\nendstream endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

async function maybeRunSandboxCanary(admin: AdminClient) {
  if (process.env.VERCEL_ENV !== "production") return { status: "skipped_nonproduction" };
  const latest = await admin.schema("audit").from("audit_logs")
    .select("created_at,metadata")
    .eq("action", "runtime.isolated_parser_canary")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestAt = latest.data?.created_at ? new Date(latest.data.created_at).getTime() : 0;
  const latestMeta = latest.data?.metadata && typeof latest.data.metadata === "object" ? latest.data.metadata as Record<string, unknown> : {};
  const previousPassed = latestMeta.status === "passed";
  const minimumIntervalMs = previousPassed ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000;
  if (latestAt && Date.now() - latestAt < minimumIntervalMs) return { status: "skipped_recent", previous: latestMeta.status || "unknown" };

  const canaryId = `canary-${randomUUID()}`;
  try {
    const execution = await runVercelIsolatedParser({
      jobId: canaryId,
      bytes: CANARY_PDF,
      mime: "application/pdf",
      originalName: "vexonyx-sandbox-canary.pdf",
      maxCpuSeconds: 20,
      maxWallSeconds: 20,
      maxOutputBytes: 1024 * 1024,
    });
    const passed = execution.result.status === "ready" && typeof execution.result.text === "string" && execution.result.text.includes(CANARY_MARKER);
    const metadata = {
      status: passed ? "passed" : "failed",
      markerFound: passed,
      parserStatus: execution.result.status,
      sandbox: execution.sandbox,
      checkedAt: new Date().toISOString(),
    };
    await admin.schema("audit").from("audit_logs").insert({
      actor_type: "system",
      action: "runtime.isolated_parser_canary",
      resource_type: "sandbox",
      request_id: canaryId,
      metadata,
    });
    if (!passed) console.error("isolated_parser_canary_failed", metadata);
    return metadata;
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 300) : "sandbox_canary_failed";
    const metadata = { status: "failed", reason, checkedAt: new Date().toISOString() };
    await admin.schema("audit").from("audit_logs").insert({
      actor_type: "system",
      action: "runtime.isolated_parser_canary",
      resource_type: "sandbox",
      request_id: canaryId,
      metadata,
    });
    console.error("isolated_parser_canary_error", metadata);
    return metadata;
  }
}

export async function POST(request: Request) {
  if (!isAuthorizedWorkerRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "worker_unavailable" }, { status: 503 });

  const workerId = `parser-${randomUUID()}`;
  const claim = await admin.schema("artifacts").rpc("claim_parser_jobs", { p_worker_id: workerId, p_limit: 2, p_lease_seconds: 480 });
  if (claim.error) return NextResponse.json({ error: "parser_queue_claim_failed" }, { status: 500 });
  const results: Array<Record<string, unknown>> = [];

  for (const job of claim.data ?? []) {
    const jobId = String(job.job_id);
    const organizationId = String(job.organization_id);
    const fileId = String(job.file_id);
    const leaseGeneration = Number(job.lease_generation);
    try {
      const fileQuery = await admin.schema("artifacts").from("files")
        .select("id,organization_id,storage_bucket,storage_path,original_name,declared_mime_type,detected_mime_type,size_bytes,status,deleted_at")
        .eq("id", fileId).eq("organization_id", organizationId).maybeSingle();
      if (fileQuery.error || !fileQuery.data || fileQuery.data.deleted_at) throw new Error("parser_file_not_found");
      const file = fileQuery.data;
      if (!Number.isSafeInteger(Number(file.size_bytes)) || Number(file.size_bytes) <= 0 || Number(file.size_bytes) > MAX_UPLOAD_BYTES) throw new Error("parser_input_size_invalid");

      const downloaded = await admin.storage.from(String(file.storage_bucket)).download(String(file.storage_path));
      if (downloaded.error || !downloaded.data) throw new Error("parser_private_download_failed");
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      if (bytes.byteLength !== Number(file.size_bytes) || bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("parser_input_size_mismatch");

      const execution = await runVercelIsolatedParser({
        jobId,
        bytes,
        mime: file.detected_mime_type ? String(file.detected_mime_type) : file.declared_mime_type ? String(file.declared_mime_type) : null,
        originalName: String(file.original_name),
        maxCpuSeconds: Number(job.max_cpu_seconds),
        maxWallSeconds: Number(job.max_wall_seconds),
        maxOutputBytes: Number(job.max_output_bytes),
        onSandboxCreated: async (session) => {
          const started = await admin.schema("artifacts").rpc("start_parser_job", {
            p_job_id: jobId,
            p_worker_id: workerId,
            p_lease_generation: leaseGeneration,
            p_sandbox_session_id: session.id,
            p_sandbox_runtime: session.runtime || "python3.13",
            p_sandbox_region: session.region || null,
          });
          if (started.error || started.data !== true) throw new Error("parser_lease_lost_before_start");
        },
      });

      const parserResult = execution.result;
      const chunks = parserResult.status === "ready" && typeof parserResult.text === "string" ? chunkText(parserResult.text) : [];
      const metadata = {
        ...(parserResult.metadata || {}),
        sandbox: execution.sandbox,
        boundedOutputBytes: Buffer.byteLength(JSON.stringify(parserResult)),
      };
      const completed = await admin.schema("artifacts").rpc("complete_parser_job", {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_lease_generation: leaseGeneration,
        p_outcome: parserResult.status,
        p_error_code: parserResult.error_code || null,
        p_output_metadata: metadata,
        p_chunks: chunks,
      });
      if (completed.error) throw completed.error;
      results.push({ jobId, fileId, status: completed.data, sandboxRuntime: execution.sandbox.runtime, parserSourceSha256: execution.sandbox.parserSourceSha256 });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 180) : "isolated_parser_failed";
      const failed = await admin.schema("artifacts").rpc("complete_parser_job", {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_lease_generation: leaseGeneration,
        p_outcome: "failed",
        p_error_code: reason,
        p_output_metadata: { failure: reason },
        p_chunks: [],
      });
      results.push({ jobId, fileId, status: failed.error ? "lease_lost" : failed.data, reason });
    }
  }

  const canary = results.length === 0 ? await maybeRunSandboxCanary(admin) : { status: "skipped_busy" };
  return NextResponse.json({ processed: results.length, results, canary }, { headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) { return POST(request); }
