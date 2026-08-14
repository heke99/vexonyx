import { inspectQuarantinedBuffer, validateUploadMetadata } from "./policy.mjs";

export { FILE_LIMITS, chunkText, detectMagicType, inspectQuarantinedBuffer, sanitizeOriginalName, sha256, validateUploadMetadata } from "./policy.mjs";

/**
 * Provider-neutral single file job. Storage/database implementations are injected.
 * Browser clients never call this directly and never promote a quarantined file.
 */
export async function processFileJob({ fileId, organizationId, repository, objectStore, scanner }) {
  if (!fileId || !organizationId) throw new Error("file_job_identity_required");
  if (!repository?.getForProcessing || !repository?.markScanning || !repository?.complete || !repository?.block || !repository?.fail) throw new Error("file_repository_contract_required");
  if (!objectStore?.readPrivateObject) throw new Error("private_object_store_contract_required");

  const file = await repository.getForProcessing({ fileId, organizationId });
  if (!file) throw new Error("file_not_found");
  if (file.organizationId !== organizationId) throw new Error("organization_mismatch");
  if (file.status !== "quarantined") return { outcome:"ignored", reason:"file_not_quarantined" };

  const metadata = validateUploadMetadata({ originalName:file.originalName, declaredMimeType:file.declaredMimeType, sizeBytes:file.sizeBytes });
  if (!metadata.ok) {
    await repository.block({ fileId, organizationId, reason:metadata.reason });
    return { outcome:"blocked", reason:metadata.reason };
  }

  await repository.markScanning({ fileId, organizationId });

  try {
    const buffer = await objectStore.readPrivateObject({ bucket:file.bucket, path:file.path, maxBytes:Number(file.sizeBytes) + 1 });
    if (!(buffer instanceof Uint8Array)) throw new Error("object_store_returned_invalid_buffer");

    if (scanner?.scan) {
      const scan = await scanner.scan({ buffer, fileName:metadata.safeName });
      if (scan?.verdict === "malicious") {
        await repository.block({ fileId, organizationId, reason:"malware_scan_blocked" });
        return { outcome:"blocked", reason:"malware_scan_blocked" };
      }
      if (scan?.verdict === "error") throw new Error("malware_scan_failed");
    }

    const inspected = inspectQuarantinedBuffer({
      buffer,
      originalName:file.originalName,
      declaredMimeType:file.declaredMimeType,
      expectedSizeBytes:file.sizeBytes,
    });

    if (inspected.decision === "blocked") {
      await repository.block({ fileId, organizationId, reason:inspected.reason, contentHash:inspected.contentHash, detectedMimeType:inspected.detectedMimeType });
      return { outcome:"blocked", reason:inspected.reason };
    }

    if (inspected.decision === "isolated_parser_required") {
      await repository.complete({
        fileId,
        organizationId,
        status:"safe_for_processing",
        contentHash:inspected.contentHash,
        detectedMimeType:inspected.detectedMimeType,
        processingMode:"isolated_parser_required",
        chunks:[],
      });
      return { outcome:"safe_for_processing", next:"isolated_parser", reason:inspected.reason };
    }

    await repository.complete({
      fileId,
      organizationId,
      status:inspected.mode === "text" ? "ready" : "safe_for_processing",
      contentHash:inspected.contentHash,
      detectedMimeType:inspected.detectedMimeType,
      processingMode:inspected.mode,
      chunks:inspected.mode === "text" ? inspected.chunks : [],
    });

    return { outcome:inspected.mode === "text" ? "ready" : "safe_for_processing", mode:inspected.mode, chunks:inspected.mode === "text" ? inspected.chunks.length : 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "file_processing_failed";
    await repository.fail({ fileId, organizationId, reason:message });
    throw error;
  }
}
