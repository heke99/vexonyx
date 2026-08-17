import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createEmailProvider } from "@/lib/email/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedWorkerRequest } from "@/lib/workers/internal-auth";

type Payload = Record<string, unknown>;
const asOptionalText = (value: unknown) => typeof value === "string" && value.length ? value : null;

export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "worker_unavailable" }, { status: 503 });
  if (!(await isAuthorizedWorkerRequest(request, admin))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const workerId = `waitlist-email-${randomUUID()}`;
  const claimed = await admin.schema("operations").rpc("claim_jobs", {
    p_queue_name: "email",
    p_worker_id: workerId,
    p_limit: 10,
    p_lease_seconds: 120,
  });
  if (claimed.error) return NextResponse.json({ error: "email_queue_claim_failed" }, { status: 500 });

  const provider = createEmailProvider();
  const results: Array<Record<string, unknown>> = [];

  for (const job of claimed.data ?? []) {
    const jobId = String(job.job_id);
    const generation = Number(job.lease_generation);
    const attempt = Number(job.attempt);
    const jobPayload = job.payload && typeof job.payload === "object" ? job.payload as Payload : {};
    const deliveryId = String(jobPayload.delivery_id ?? "");

    if (jobPayload.job_type !== "waitlist_email" || !deliveryId) {
      await admin.schema("operations").rpc("finish_job", {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_lease_generation: generation,
        p_success: false,
        p_error: { code: "invalid_waitlist_email_payload" },
      });
      results.push({ jobId, status: "failed", reason: "invalid_payload" });
      continue;
    }

    const started = await admin.schema("operations").rpc("start_job", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_lease_generation: generation,
    });
    if (started.error || started.data !== true) continue;

    try {
      const deliveryQuery = await admin
        .schema("launch")
        .from("waitlist_email_deliveries")
        .select("id,kind,recipient,payload,status,max_attempts,expires_at")
        .eq("id", deliveryId)
        .maybeSingle();
      if (deliveryQuery.error || !deliveryQuery.data) throw new Error("waitlist_email_delivery_not_found");

      const delivery = deliveryQuery.data;
      if (delivery.status === "sent" || delivery.status === "dead_letter") {
        await admin.schema("operations").rpc("finish_job", {
          p_job_id: jobId,
          p_worker_id: workerId,
          p_lease_generation: generation,
          p_success: true,
          p_error: null,
        });
        results.push({ deliveryId, status: delivery.status, idempotent: true });
        continue;
      }

      if (delivery.expires_at && new Date(delivery.expires_at).getTime() <= Date.now()) {
        await admin.schema("launch").from("waitlist_email_deliveries").update({
          status: "dead_letter",
          attempt_count: attempt,
          last_error: "delivery_expired",
          payload: {},
          updated_at: new Date().toISOString(),
        }).eq("id", deliveryId);
        await admin.schema("operations").rpc("finish_job", {
          p_job_id: jobId,
          p_worker_id: workerId,
          p_lease_generation: generation,
          p_success: true,
          p_error: null,
        });
        results.push({ deliveryId, status: "dead_letter", reason: "expired" });
        continue;
      }

      await admin.schema("launch").from("waitlist_email_deliveries").update({
        status: "sending",
        attempt_count: attempt,
        updated_at: new Date().toISOString(),
      }).eq("id", deliveryId);

      const payload = delivery.payload && typeof delivery.payload === "object" ? delivery.payload as Payload : {};
      let sendResult;
      if (delivery.kind === "verification") {
        const verificationUrl = asOptionalText(payload.verificationUrl);
        if (!verificationUrl) throw new Error("verification_url_missing");
        sendResult = await provider.sendWaitlistVerification({
          to: delivery.recipient,
          verificationUrl,
          name: asOptionalText(payload.name),
        });
      } else if (delivery.kind === "confirmed") {
        sendResult = await provider.sendWaitlistConfirmed({
          to: delivery.recipient,
          name: asOptionalText(payload.name),
          referralUrl: asOptionalText(payload.referralUrl),
        });
      } else {
        throw new Error("unsupported_waitlist_email_kind");
      }

      if (sendResult.sent) {
        const now = new Date().toISOString();
        const updated = await admin.schema("launch").from("waitlist_email_deliveries").update({
          status: "sent",
          provider_message_id: sendResult.messageId ?? null,
          sent_at: now,
          last_error: null,
          payload: {},
          updated_at: now,
        }).eq("id", deliveryId);
        if (updated.error) throw updated.error;

        const finished = await admin.schema("operations").rpc("finish_job", {
          p_job_id: jobId,
          p_worker_id: workerId,
          p_lease_generation: generation,
          p_success: true,
          p_error: null,
        });
        if (finished.error || finished.data !== true) throw new Error("waitlist_email_lease_lost");
        results.push({ deliveryId, status: "sent", attempt });
        continue;
      }

      const terminal = attempt >= Number(delivery.max_attempts ?? 5);
      await admin.schema("launch").from("waitlist_email_deliveries").update({
        status: terminal ? "dead_letter" : "queued",
        last_error: sendResult.reason,
        payload: terminal ? {} : payload,
        updated_at: new Date().toISOString(),
      }).eq("id", deliveryId);
      await admin.schema("operations").rpc("finish_job", {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_lease_generation: generation,
        p_success: false,
        p_error: { code: sendResult.reason },
      });
      results.push({ deliveryId, status: terminal ? "dead_letter" : "retry_queued", attempt, reason: sendResult.reason });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 160) : "waitlist_email_failed";
      const terminal = attempt >= 5;
      await admin.schema("launch").from("waitlist_email_deliveries").update({
        status: terminal ? "dead_letter" : "queued",
        last_error: reason,
        ...(terminal ? { payload: {} } : {}),
        updated_at: new Date().toISOString(),
      }).eq("id", deliveryId);
      await admin.schema("operations").rpc("finish_job", {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_lease_generation: generation,
        p_success: false,
        p_error: { code: reason },
      });
      results.push({ deliveryId, status: terminal ? "dead_letter" : "retry_queued", attempt, reason });
    }
  }

  return NextResponse.json({ processed: results.length, results }, { headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  return POST(request);
}
