import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

function matchesEnvironmentSecret(supplied: string) {
  const expected = process.env.WORKER_SHARED_SECRET || process.env.CRON_SECRET;
  if (!expected || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAuthorizedWorkerRequest(request: Request, admin: SupabaseClient) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!supplied) return false;
  if (matchesEnvironmentSecret(supplied)) return true;
  const verified = await admin.schema("security").rpc("verify_worker_token", { p_token: supplied });
  return !verified.error && verified.data === true;
}
