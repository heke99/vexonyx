import "server-only";
import { timingSafeEqual } from "node:crypto";

export function isAuthorizedWorkerRequest(request: Request) {
  const expected = process.env.WORKER_SHARED_SECRET || process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
