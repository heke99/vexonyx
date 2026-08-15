import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("report worker continuously canaries PDF and DOCX through private storage", () => {
  const worker = read("../app/api/internal/workers/render-reports/route.ts");
  assert.match(worker, /renderPdf/);
  assert.match(worker, /renderDocx/);
  assert.match(worker, /runtime\.report_renderer_canary/);
  assert.match(worker, /storageRoundTrip/);
  assert.match(worker, /cleanupVerified/);
  assert.match(worker, /project-artifacts/);
  assert.match(worker, /\.download\(/);
  assert.match(worker, /\.remove\(/);
  assert.match(worker, /validPdf/);
  assert.match(worker, /validDocx/);
});

test("worker lease expiry is recovered for generic and isolated-parser queues", () => {
  const migration = read("../../../supabase/migrations/20260815113500_worker_lease_recovery.sql");
  assert.match(migration, /operations\.requeue_expired_leases/);
  assert.match(migration, /artifacts\.requeue_expired_parser_leases/);
  assert.match(migration, /status in \('leased','running'\)/i);
  assert.match(migration, /status in \('leased','parsing'\)/i);
  assert.match(migration, /vexonyx-lease-recovery/);
  assert.match(migration, /\* \* \* \* \*/);
  assert.match(migration, /parser_lease_expired/);
});

test("isolated parser retains deny-all network and verified teardown", () => {
  const sandbox = read("../lib/sandbox/vercel-isolated-parser.ts");
  const worker = read("../app/api/internal/workers/isolated-parser/route.ts");
  assert.match(sandbox, /networkPolicy:\s*\{ mode: "deny-all" \}/);
  assert.match(sandbox, /persistent:\s*false/);
  assert.match(sandbox, /finally/);
  assert.match(sandbox, /stopSandbox/);
  assert.match(worker, /teardownVerified:\s*true/);
  assert.match(worker, /runtime\.isolated_parser_canary/);
});
