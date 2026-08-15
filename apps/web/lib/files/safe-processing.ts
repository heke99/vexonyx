import "server-only";
import { createHash } from "node:crypto";

export const FILE_PROCESSING_VERSION = "file-inspection-v1";
export const ISOLATED_PARSER_VERSION = "vexonyx-safe-parser-1";
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_CHUNK_CHARACTERS = 6_000;
const CHUNK_OVERLAP_CHARACTERS = 400;
const MAX_CHUNKS = 5_000;

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".json", ".jsonl", ".csv", ".tsv", ".yaml", ".yml", ".xml", ".html", ".htm", ".log", ".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".rs", ".java", ".kt", ".swift", ".rb", ".php", ".sh", ".sql", ".toml", ".ini", ".conf", ".env.example"]);
const ARCHIVE_EXTENSIONS = new Set([".zip", ".7z", ".rar", ".tar", ".gz", ".tgz", ".bz2", ".xz"]);
const EXECUTABLE_EXTENSIONS = new Set([".exe", ".dll", ".msi", ".com", ".scr", ".bat", ".cmd", ".ps1", ".app", ".dmg", ".pkg", ".deb", ".rpm", ".apk", ".jar"]);

function extensionOf(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".env.example")) return ".env.example";
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

export function sanitizeOriginalName(name: string) {
  const normalized = name.normalize("NFKC").replaceAll("\\", "/");
  const base = normalized.split("/").pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim() ?? "";
  if (!base || base === "." || base === "..") throw new Error("invalid_file_name");
  if (base.length > 255) throw new Error("file_name_too_long");
  return base;
}

function detectMagicType(buffer: Uint8Array) {
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03, 0x05, 0x07].includes(buffer[2] ?? -1) && [0x04, 0x06, 0x08].includes(buffer[3] ?? -1)) return "application/zip";
  if (buffer.length >= 5 && Buffer.from(buffer.subarray(0, 5)).toString("ascii") === "%PDF-") return "application/pdf";
  if (buffer.length >= 8 && Buffer.from(buffer.subarray(0, 8)).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) return "application/gzip";
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) return "application/x-elf";
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) return "application/x-msdownload";
  return null;
}

function appearsTextual(buffer: Uint8Array) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 64 * 1024));
  if (sample.includes(0)) return false;
  let suspicious = 0;
  for (const byte of sample) if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) suspicious += 1;
  return sample.length === 0 || suspicious / sample.length < 0.01;
}

export type FileChunk = { index: number; content: string; contentHash: string };

export function chunkText(text: string): FileChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized) return [];
  const chunks: FileChunk[] = [];
  let start = 0;
  while (start < normalized.length) {
    if (chunks.length >= MAX_CHUNKS) throw new Error("chunk_limit_exceeded");
    let end = Math.min(start + MAX_CHUNK_CHARACTERS, normalized.length);
    if (end < normalized.length) {
      const candidate = Math.max(normalized.lastIndexOf("\n\n", end), normalized.lastIndexOf("\n", end), normalized.lastIndexOf(" ", end));
      if (candidate > start + Math.floor(MAX_CHUNK_CHARACTERS * 0.55)) end = candidate;
    }
    const content = normalized.slice(start, end).trim();
    if (content) chunks.push({ index: chunks.length, content, contentHash: createHash("sha256").update(content).digest("hex") });
    if (end >= normalized.length) break;
    start = Math.max(end - CHUNK_OVERLAP_CHARACTERS, start + 1);
  }
  return chunks;
}

export type InspectionResult =
  | { decision: "blocked"; reason: string; contentHash: string; detectedMimeType: string | null }
  | { decision: "ready_text"; reason: string; contentHash: string; detectedMimeType: string; chunks: FileChunk[] }
  | { decision: "safe_nontext"; reason: string; contentHash: string; detectedMimeType: string | null }
  | { decision: "isolated_parser"; reason: string; contentHash: string; detectedMimeType: string | null };

export function inspectPrivateFile(input: { buffer: Uint8Array; originalName: string; declaredMimeType: string | null; expectedSizeBytes: number }): InspectionResult {
  const { buffer } = input;
  const safeName = sanitizeOriginalName(input.originalName);
  const expected = Number(input.expectedSizeBytes);
  const extension = extensionOf(safeName);
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const detectedMimeType = detectMagicType(buffer);
  const declared = input.declaredMimeType?.toLowerCase() ?? null;

  if (!Number.isSafeInteger(expected) || expected <= 0 || expected > MAX_UPLOAD_BYTES) return { decision: "blocked", reason: "invalid_size", contentHash, detectedMimeType };
  if (buffer.byteLength !== expected) return { decision: "blocked", reason: "size_mismatch", contentHash, detectedMimeType };
  if (EXECUTABLE_EXTENSIONS.has(extension) || detectedMimeType === "application/x-elf" || detectedMimeType === "application/x-msdownload") return { decision: "blocked", reason: "executable_content_blocked", contentHash, detectedMimeType };
  if (ARCHIVE_EXTENSIONS.has(extension) || detectedMimeType === "application/zip" || detectedMimeType === "application/gzip") return { decision: "isolated_parser", reason: "archive_requires_bounded_parser", contentHash, detectedMimeType };
  if (detectedMimeType === "application/pdf" || extension === ".pdf" || extension === ".docx") return { decision: "isolated_parser", reason: "document_requires_bounded_parser", contentHash, detectedMimeType: detectedMimeType ?? declared };
  if (detectedMimeType?.startsWith("image/")) return { decision: "safe_nontext", reason: "image_safe_for_future_processing", contentHash, detectedMimeType };

  if (TEXT_EXTENSIONS.has(extension) || declared?.startsWith("text/") || declared === "application/json" || declared === "application/xml") {
    if (!appearsTextual(buffer)) return { decision: "blocked", reason: "declared_text_contains_binary_data", contentHash, detectedMimeType };
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
    catch { return { decision: "blocked", reason: "invalid_utf8_text", contentHash, detectedMimeType }; }
    return { decision: "ready_text", reason: "bounded_text_ready", contentHash, detectedMimeType: detectedMimeType ?? declared ?? "text/plain", chunks: chunkText(text) };
  }

  return { decision: "isolated_parser", reason: "unsupported_type_requires_safe_parser", contentHash, detectedMimeType: detectedMimeType ?? declared };
}
