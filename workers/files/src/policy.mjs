import { createHash } from "node:crypto";
import path from "node:path";

export const FILE_LIMITS = Object.freeze({
  maxUploadBytes: 100 * 1024 * 1024,
  maxArchiveDepth: 4,
  maxArchiveFiles: 2500,
  maxDecompressedBytes: 500 * 1024 * 1024,
  maxDecompressionRatio: 40,
  maxParserRuntimeMs: 30_000,
  maxParserMemoryMb: 512,
  maxChunkCharacters: 6_000,
  chunkOverlapCharacters: 400,
  maxChunks: 5_000,
});

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".json", ".jsonl", ".csv", ".tsv", ".yaml", ".yml", ".xml", ".html", ".htm", ".log", ".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".rs", ".java", ".kt", ".swift", ".rb", ".php", ".sh", ".sql", ".toml", ".ini", ".conf", ".env.example"]);
const ARCHIVE_EXTENSIONS = new Set([".zip", ".7z", ".rar", ".tar", ".gz", ".tgz", ".bz2", ".xz"]);
const EXECUTABLE_EXTENSIONS = new Set([".exe", ".dll", ".msi", ".com", ".scr", ".bat", ".cmd", ".ps1", ".app", ".dmg", ".pkg", ".deb", ".rpm", ".apk", ".jar"]);

function extensionOf(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".env.example")) return ".env.example";
  return path.extname(lower);
}

export function sanitizeOriginalName(name) {
  if (typeof name !== "string") throw new TypeError("file_name_required");
  const normalized = name.normalize("NFKC").replaceAll("\\", "/");
  const base = normalized.split("/").pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim() ?? "";
  if (!base || base === "." || base === "..") throw new Error("invalid_file_name");
  if (base.length > 255) throw new Error("file_name_too_long");
  return base;
}

export function validateUploadMetadata({ originalName, declaredMimeType, sizeBytes }) {
  const safeName = sanitizeOriginalName(originalName);
  const size = Number(sizeBytes);
  if (!Number.isSafeInteger(size) || size <= 0) return { ok:false, reason:"invalid_size", safeName };
  if (size > FILE_LIMITS.maxUploadBytes) return { ok:false, reason:"file_too_large", safeName };
  if (declaredMimeType != null && (typeof declaredMimeType !== "string" || declaredMimeType.length > 255)) return { ok:false, reason:"invalid_mime_type", safeName };
  const extension = extensionOf(safeName);
  if (EXECUTABLE_EXTENSIONS.has(extension)) return { ok:false, reason:"executable_file_type_blocked", safeName, extension };
  return { ok:true, safeName, extension, archive:ARCHIVE_EXTENSIONS.has(extension), textCandidate:TEXT_EXTENSIONS.has(extension) };
}

export function detectMagicType(buffer) {
  if (!(buffer instanceof Uint8Array)) throw new TypeError("buffer_required");
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03,0x05,0x07].includes(buffer[2]) && [0x04,0x06,0x08].includes(buffer[3])) return "application/zip";
  if (buffer.length >= 5 && Buffer.from(buffer.subarray(0,5)).toString("ascii") === "%PDF-") return "application/pdf";
  if (buffer.length >= 8 && Buffer.from(buffer.subarray(0,8)).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) return "application/gzip";
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) return "application/x-elf";
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) return "application/x-msdownload";
  return null;
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function appearsTextual(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 64 * 1024));
  if (sample.includes(0)) return false;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) suspicious += 1;
  }
  return sample.length === 0 || suspicious / sample.length < 0.01;
}

export function chunkText(text, { maxCharacters = FILE_LIMITS.maxChunkCharacters, overlapCharacters = FILE_LIMITS.chunkOverlapCharacters, maxChunks = FILE_LIMITS.maxChunks } = {}) {
  if (typeof text !== "string") throw new TypeError("text_required");
  if (!Number.isInteger(maxCharacters) || maxCharacters < 256) throw new Error("invalid_chunk_size");
  if (!Number.isInteger(overlapCharacters) || overlapCharacters < 0 || overlapCharacters >= maxCharacters) throw new Error("invalid_chunk_overlap");
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized) return [];
  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    if (chunks.length >= maxChunks) throw new Error("chunk_limit_exceeded");
    let end = Math.min(start + maxCharacters, normalized.length);
    if (end < normalized.length) {
      const paragraph = normalized.lastIndexOf("\n\n", end);
      const line = normalized.lastIndexOf("\n", end);
      const space = normalized.lastIndexOf(" ", end);
      const candidate = Math.max(paragraph, line, space);
      if (candidate > start + Math.floor(maxCharacters * 0.55)) end = candidate;
    }
    const content = normalized.slice(start, end).trim();
    if (content) chunks.push({ index:chunks.length, content, contentHash:createHash("sha256").update(content).digest("hex") });
    if (end >= normalized.length) break;
    start = Math.max(end - overlapCharacters, start + 1);
  }
  return chunks;
}

export function inspectQuarantinedBuffer({ buffer, originalName, declaredMimeType, expectedSizeBytes }) {
  if (!(buffer instanceof Uint8Array)) throw new TypeError("buffer_required");
  const metadata = validateUploadMetadata({ originalName, declaredMimeType, sizeBytes:expectedSizeBytes });
  const contentHash = sha256(buffer);
  if (!metadata.ok) return { decision:"blocked", reason:metadata.reason, contentHash, detectedMimeType:detectMagicType(buffer) };
  if (buffer.byteLength !== Number(expectedSizeBytes)) return { decision:"blocked", reason:"size_mismatch", contentHash, detectedMimeType:detectMagicType(buffer) };

  const detectedMimeType = detectMagicType(buffer);
  if (detectedMimeType === "application/x-elf" || detectedMimeType === "application/x-msdownload") return { decision:"blocked", reason:"executable_content_blocked", contentHash, detectedMimeType };
  if (detectedMimeType === "application/zip" || detectedMimeType === "application/gzip" || metadata.archive) return { decision:"isolated_parser_required", reason:"archive_requires_bounded_extraction", contentHash, detectedMimeType, limits:FILE_LIMITS };
  if (detectedMimeType === "application/pdf") return { decision:"isolated_parser_required", reason:"pdf_requires_bounded_parser", contentHash, detectedMimeType, limits:FILE_LIMITS };
  if (detectedMimeType?.startsWith("image/")) return { decision:"safe_for_processing", mode:"image", contentHash, detectedMimeType };

  if (metadata.textCandidate || declaredMimeType?.startsWith("text/") || declaredMimeType === "application/json" || declaredMimeType === "application/xml") {
    if (!appearsTextual(buffer)) return { decision:"blocked", reason:"declared_text_contains_binary_data", contentHash, detectedMimeType };
    let text;
    try { text = new TextDecoder("utf-8", { fatal:true }).decode(buffer); }
    catch { return { decision:"blocked", reason:"invalid_utf8_text", contentHash, detectedMimeType }; }
    return { decision:"safe_for_processing", mode:"text", contentHash, detectedMimeType:detectedMimeType ?? declaredMimeType ?? "text/plain", text, chunks:chunkText(text) };
  }

  return { decision:"isolated_parser_required", reason:"unsupported_type_requires_safe_parser", contentHash, detectedMimeType, limits:FILE_LIMITS };
}
