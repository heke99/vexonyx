import "server-only";
import { gzipSync } from "node:zlib";
import { sanitizeOriginalName } from "@/lib/files/safe-processing";
import { ISOLATED_PARSER_RUNTIME_SOURCE, ISOLATED_PARSER_SOURCE_SHA256 } from "./parser-runtime-source";

const API = "https://api.vercel.com/v2/sandboxes";
const CWD = "/vercel/sandbox";

type SandboxSession = { id: string; runtime?: string; region?: string; networkPolicy?: { mode?: string }; memory?: string | number; vcpus?: string | number };
type VercelRequestContext = { headers?: Record<string, string> };
type VercelOidcClaims = { project_id?: unknown };
export type ParserPayload = { status: "ready" | "blocked" | "failed"; text?: string; metadata?: Record<string, unknown>; error_code?: string; detail?: string };

function requestContextOidcToken() {
  const key = Symbol.for("@vercel/request-context");
  const carrier = (globalThis as unknown as Record<symbol, { get?: () => VercelRequestContext } | undefined>)[key];
  const value = carrier?.get?.()?.headers?.["x-vercel-oidc-token"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function token() {
  const value = requestContextOidcToken() || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL_SANDBOX_TOKEN;
  if (!value) throw new Error("sandbox_identity_unavailable");
  return value;
}

function projectIdFromOidc(value: string) {
  const payloadPart = value.split(".")[1];
  if (!payloadPart) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as VercelOidcClaims;
    const candidate = payload.project_id;
    return typeof candidate === "string" && /^prj_[A-Za-z0-9]+$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function projectId() {
  const explicit = process.env.VERCEL_PROJECT_ID;
  if (explicit) return explicit;
  const derived = projectIdFromOidc(token());
  if (!derived) throw new Error("sandbox_project_identity_unavailable");
  return derived;
}

async function api(path: string, init: RequestInit) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token()}`, ...(init.headers || {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`sandbox_api_${response.status}:${detail.replace(/[\r\n]+/g, " ")}`);
  }
  return response;
}

function octal(value: number, width: number) {
  return Math.max(0, Math.floor(value)).toString(8).padStart(width - 1, "0").slice(-(width - 1)) + "\0";
}

function tarHeader(name: string, size: number) {
  if (!name || Buffer.byteLength(name) > 100) throw new Error("sandbox_tar_name_invalid");
  const h = Buffer.alloc(512, 0);
  h.write(name, 0, 100, "utf8");
  h.write(octal(0o600, 8), 100, 8, "ascii");
  h.write(octal(10001, 8), 108, 8, "ascii");
  h.write(octal(10001, 8), 116, 8, "ascii");
  h.write(octal(size, 12), 124, 12, "ascii");
  h.write(octal(Math.floor(Date.now() / 1000), 12), 136, 12, "ascii");
  h.fill(0x20, 148, 156);
  h[156] = "0".charCodeAt(0);
  h.write("ustar\0", 257, 6, "ascii");
  h.write("00", 263, 2, "ascii");
  const checksum = h.reduce((sum, byte) => sum + byte, 0);
  h.write(octal(checksum, 8), 148, 8, "ascii");
  return h;
}

function tarGzip(entries: Array<{ name: string; data: Buffer }>) {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    parts.push(tarHeader(entry.name, entry.data.length), entry.data);
    const padding = (512 - (entry.data.length % 512)) % 512;
    if (padding) parts.push(Buffer.alloc(padding));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts), { level: 6 });
}

async function createSandbox(jobId: string, timeoutMs: number): Promise<SandboxSession> {
  const name = `vx-parser-${jobId.slice(0, 8)}-${Date.now().toString(36)}`.slice(0, 60);
  const response = await api("", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      projectId: projectId(),
      runtime: "python3.13",
      resources: { vcpus: "1", memory: "2048" },
      networkPolicy: { mode: "deny-all" },
      ports: [],
      persistent: false,
      timeout: String(Math.min(Math.max(timeoutMs + 60_000, 120_000), 360_000)),
      tags: { workload: "isolated-parser", job: jobId.slice(0, 36) },
    }),
  });
  const payload = await response.json() as { session?: SandboxSession; sandbox?: SandboxSession; value?: SandboxSession };
  const session = payload.session || payload.sandbox || payload.value;
  if (!session?.id) throw new Error("sandbox_create_missing_session");
  if (session.networkPolicy?.mode && !["deny-all", "deny_all"].includes(session.networkPolicy.mode)) throw new Error("sandbox_network_policy_not_deny_all");
  return session;
}

async function stopSandbox(sessionId: string) {
  try { await api(`/sessions/${encodeURIComponent(sessionId)}/stop`, { method: "POST" }); }
  catch (error) { console.error("sandbox_stop_failed", { sessionId, error: error instanceof Error ? error.message : "unknown" }); }
}

async function uploadInputs(sessionId: string, input: Uint8Array) {
  const archive = tarGzip([
    { name: "parser.py", data: Buffer.from(ISOLATED_PARSER_RUNTIME_SOURCE, "utf8") },
    { name: "input/document", data: Buffer.from(input) },
  ]);
  await api(`/sessions/${encodeURIComponent(sessionId)}/fs/write`, {
    method: "POST",
    headers: { "content-type": "application/gzip", "x-cwd": CWD },
    body: new Uint8Array(archive),
  });
}

async function executeParser(sessionId: string, mime: string, originalName: string, timeoutMs: number) {
  const response = await api(`/sessions/${encodeURIComponent(sessionId)}/cmd`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      command: "python3",
      args: ["parser.py", "--input", "input/document", "--mime", mime, "--name", originalName, "--output", "result.json"],
      cwd: CWD,
      sudo: false,
      wait: false,
      logs: false,
      timeout: timeoutMs,
    }),
  });
  const payload = await response.json() as { command?: { id?: string } };
  const commandId = payload.command?.id;
  if (!commandId) throw new Error("sandbox_command_missing_id");
  const statusResponse = await api(`/sessions/${encodeURIComponent(sessionId)}/cmd/${encodeURIComponent(commandId)}?wait=true`, { method: "GET" });
  const status = await statusResponse.json() as { command?: { exitCode?: number | string | null } };
  const exitCode = status.command?.exitCode == null ? null : Number(status.command.exitCode);
  if (exitCode == null || !Number.isFinite(exitCode)) throw new Error("sandbox_command_no_exit_code");
  return exitCode;
}

async function readResult(sessionId: string, maxOutputBytes: number) {
  const response = await api(`/sessions/${encodeURIComponent(sessionId)}/fs/read`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cwd: CWD, path: "result.json" }),
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 2 || bytes.byteLength > maxOutputBytes) throw new Error("sandbox_output_size_invalid");
  let raw = Buffer.from(bytes).toString("utf8");
  if ((response.headers.get("content-type") || "").includes("application/json")) {
    try {
      const wrapper = JSON.parse(raw) as unknown;
      if (typeof wrapper === "string") raw = wrapper;
      else if (wrapper && typeof wrapper === "object" && "content" in wrapper && typeof (wrapper as { content?: unknown }).content === "string") raw = String((wrapper as { content: string }).content);
    } catch { /* raw file bodies may still be labeled JSON */ }
  }
  const parsed = JSON.parse(raw) as ParserPayload;
  if (!parsed || !["ready", "blocked", "failed"].includes(parsed.status)) throw new Error("sandbox_output_schema_invalid");
  if (parsed.text != null && typeof parsed.text !== "string") throw new Error("sandbox_output_text_invalid");
  if (parsed.metadata != null && (typeof parsed.metadata !== "object" || Array.isArray(parsed.metadata))) throw new Error("sandbox_output_metadata_invalid");
  return parsed;
}

export async function runVercelIsolatedParser(input: {
  jobId: string;
  bytes: Uint8Array;
  mime: string | null;
  originalName: string;
  maxCpuSeconds: number;
  maxWallSeconds: number;
  maxOutputBytes: number;
  onSandboxCreated?: (session: SandboxSession) => Promise<void>;
}) {
  if (input.bytes.byteLength > 100 * 1024 * 1024) throw new Error("sandbox_input_too_large");
  const safeName = sanitizeOriginalName(input.originalName);
  const seconds = Math.max(5, Math.min(300, Math.min(input.maxCpuSeconds, input.maxWallSeconds)));
  const timeoutMs = seconds * 1000;
  const maxOutput = Math.max(1024, Math.min(input.maxOutputBytes, 100 * 1024 * 1024));
  let session: SandboxSession | null = null;
  try {
    session = await createSandbox(input.jobId, timeoutMs);
    await input.onSandboxCreated?.(session);
    await uploadInputs(session.id, input.bytes);
    const exitCode = await executeParser(session.id, input.mime || "", safeName, timeoutMs);
    const result = await readResult(session.id, maxOutput);
    if (result.status === "ready" && exitCode !== 0) throw new Error("sandbox_ready_nonzero_exit");
    if (result.status === "blocked" && exitCode !== 2) throw new Error("sandbox_blocked_exit_mismatch");
    if (result.status === "failed" && exitCode !== 1) throw new Error("sandbox_failed_exit_mismatch");
    return {
      result,
      sandbox: {
        sessionId: session.id,
        runtime: session.runtime || "python3.13",
        region: session.region || null,
        memoryMb: Number(session.memory || 2048),
        vcpus: Number(session.vcpus || 1),
        networkPolicy: "deny_all",
        parserSourceSha256: ISOLATED_PARSER_SOURCE_SHA256,
      },
    };
  } finally {
    if (session?.id) await stopSandbox(session.id);
  }
}
