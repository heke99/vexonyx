import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");

test("Vercel parser sandbox is deny-all, bounded, non-sudo and teardown failures propagate", () => {
  const controller = read("../lib/sandbox/vercel-isolated-parser.ts");
  assert.match(controller, /Symbol\.for\("@vercel\/request-context"\)/);
  assert.match(controller, /x-vercel-oidc-token/);
  assert.match(controller, /VERCEL_OIDC_TOKEN/);
  assert.match(controller, /project_id/);
  assert.match(controller, /base64url/);
  assert.match(controller, /runtime:\s*"python3\.13"/);
  assert.match(controller, /resources:\s*\{\s*vcpus:\s*1\s*\}/);
  assert.doesNotMatch(controller, /resources:\s*\{[^}]*memory/);
  assert.match(controller, /timeout:\s*Math\.min\(/);
  assert.doesNotMatch(controller, /timeout:\s*String\(/);
  assert.match(controller, /networkPolicy:\s*\{\s*mode:\s*"deny-all"\s*\}/);
  assert.match(controller, /ports:\s*\[\]/);
  assert.match(controller, /persistent:\s*false/);
  assert.match(controller, /sudo:\s*false/);
  assert.match(controller, /async function stopSandbox[\s\S]*?method:\s*"POST"[\s\S]*?"content-type":\s*"application\/json"/);
  const stopFunction = controller.match(/async function stopSandbox[\s\S]*?\n}\n\nasync function uploadInputs/)?.[0] || "";
  assert.doesNotMatch(stopFunction, /catch\s*\(/);
  assert.match(controller, /finally\s*\{[\s\S]*await stopSandbox/);
  assert.doesNotMatch(controller, /publish-port|allowedDomains:\s*\[[^\]]+\]/);
});

test("internal workers accept only environment secrets or service-verified scheduler tokens", () => {
  const fileWorker = read("../app/api/internal/workers/file-processing/route.ts");
  const parserWorker = read("../app/api/internal/workers/isolated-parser/route.ts");
  const auth = read("../lib/workers/internal-auth.ts");
  assert.match(fileWorker, /await isAuthorizedWorkerRequest\(request, admin\)/);
  assert.match(parserWorker, /await isAuthorizedWorkerRequest\(request, admin\)/);
  assert.match(auth, /WORKER_SHARED_SECRET/);
  assert.match(auth, /CRON_SECRET/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /schema\("security"\)\.rpc\("verify_worker_token"/);
  assert.doesNotMatch(auth, /x-vercel-cron/i);
});

test("bundled Python parser normalizes, compiles and emits bounded JSON", () => {
  const sourceFile = read("../lib/sandbox/parser-source.ts");
  const match = sourceFile.match(/String\.raw`([\s\S]*)`;\s*$/);
  assert.ok(match?.[1], "parser source template is present");
  const python = match[1].replaceAll("\\\\", "\\");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vx-parser-"));
  try {
    const parserPath = path.join(dir, "parser.py");
    const inputPath = path.join(dir, "sample.txt");
    const outputPath = path.join(dir, "result.json");
    fs.writeFileSync(parserPath, python);
    fs.writeFileSync(inputPath, "authorized security review\nsecond line\n");
    const compile = spawnSync("python3", ["-m", "py_compile", parserPath], { encoding: "utf8" });
    assert.equal(compile.status, 0, compile.stderr || "python parser failed to compile");
    const run = spawnSync("python3", [parserPath, "--input", inputPath, "--mime", "text/plain", "--name", "sample.txt", "--output", outputPath], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr || "python parser failed to run");
    const result = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(result.status, "ready");
    assert.match(result.text, /authorized security review/);
    assert.equal(result.metadata.network, "deny_all");
    assert.ok(fs.statSync(outputPath).size < 10 * 1024 * 1024);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("production parser canary requires verified teardown before 24-hour health status", () => {
  const parserWorker = read("../app/api/internal/workers/isolated-parser/route.ts");
  assert.match(parserWorker, /VERCEL_ENV !== "production"/);
  assert.match(parserWorker, /VEXONYX_SANDBOX_CANARY/);
  assert.match(parserWorker, /runtime\.isolated_parser_canary/);
  assert.match(parserWorker, /latestMeta\.status === "passed" && latestMeta\.teardownVerified === true/);
  assert.match(parserWorker, /previousPassNeedsTeardownVerification/);
  assert.match(parserWorker, /previousPassNeedsTeardownVerification \? 0 : 15 \* 60 \* 1000/);
  assert.match(parserWorker, /teardownVerified:\s*true/);
  assert.match(parserWorker, /results\.length === 0 \? await maybeRunSandboxCanary/);
  assert.match(parserWorker, /markerFound/);
});

test("Vercel crons are removed because production scheduling is Vault-backed in Supabase", () => {
  const config = JSON.parse(read("../../../vercel.json"));
  assert.ok(!config.crons || config.crons.length === 0);
  const migration = read("../../../supabase/migrations/20260815014947_supabase_worker_scheduler.sql");
  assert.match(migration, /create extension if not exists pg_net/);
  assert.match(migration, /create extension if not exists pg_cron/);
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /vexonyx_worker_scheduler_token/);
  assert.match(migration, /security\.verify_worker_token/);
  assert.match(migration, /security\.invoke_worker/);
  assert.match(migration, /vexonyx-isolated-parser/);
  assert.match(migration, /enabled boolean not null default false/);
});
