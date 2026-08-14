import test from "node:test";
import assert from "node:assert/strict";
import { FILE_LIMITS, chunkText, inspectQuarantinedBuffer, processFileJob, validateUploadMetadata } from "../src/index.mjs";

test("upload metadata rejects executables and oversize files", () => {
  assert.equal(validateUploadMetadata({ originalName:"payload.exe", declaredMimeType:"application/octet-stream", sizeBytes:10 }).ok, false);
  assert.equal(validateUploadMetadata({ originalName:"notes.txt", declaredMimeType:"text/plain", sizeBytes:FILE_LIMITS.maxUploadBytes + 1 }).reason, "file_too_large");
});

test("text is decoded, hashed and chunked without a GPU", () => {
  const buffer = new TextEncoder().encode("Authorized assessment notes\n".repeat(900));
  const result = inspectQuarantinedBuffer({ buffer, originalName:"notes.md", declaredMimeType:"text/markdown", expectedSizeBytes:buffer.byteLength });
  assert.equal(result.decision, "safe_for_processing");
  assert.equal(result.mode, "text");
  assert.ok(result.contentHash.length === 64);
  assert.ok(result.chunks.length > 1);
});

test("archive content never expands in the trusted worker", () => {
  const buffer = Uint8Array.from([0x50,0x4b,0x03,0x04,0,0,0,0]);
  const result = inspectQuarantinedBuffer({ buffer, originalName:"evidence.zip", declaredMimeType:"application/zip", expectedSizeBytes:buffer.byteLength });
  assert.equal(result.decision, "isolated_parser_required");
  assert.equal(result.reason, "archive_requires_bounded_extraction");
});

test("binary content pretending to be text is blocked", () => {
  const buffer = Uint8Array.from([65,66,0,67,68]);
  const result = inspectQuarantinedBuffer({ buffer, originalName:"notes.txt", declaredMimeType:"text/plain", expectedSizeBytes:buffer.byteLength });
  assert.equal(result.decision, "blocked");
  assert.equal(result.reason, "declared_text_contains_binary_data");
});

test("chunking enforces bounded output", () => {
  assert.throws(() => chunkText("a".repeat(50_000), { maxCharacters:1000, overlapCharacters:50, maxChunks:2 }), /chunk_limit_exceeded/);
});

test("file job keeps cross-organization and client promotion impossible", async () => {
  const calls = [];
  const repository = {
    async getForProcessing(){ return { organizationId:"org-b", status:"quarantined", originalName:"x.txt", declaredMimeType:"text/plain", sizeBytes:1, bucket:"b", path:"p" }; },
    async markScanning(){ calls.push("scan"); }, async complete(){ calls.push("complete"); }, async block(){ calls.push("block"); }, async fail(){ calls.push("fail"); }
  };
  await assert.rejects(() => processFileJob({ fileId:"file", organizationId:"org-a", repository, objectStore:{ async readPrivateObject(){ return new Uint8Array([65]); } } }), /organization_mismatch/);
  assert.deepEqual(calls, []);
});
