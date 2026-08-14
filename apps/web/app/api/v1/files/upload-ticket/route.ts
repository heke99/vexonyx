import { createClient } from "@/lib/supabase/server";

const maxBytes = 100 * 1024 * 1024;
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }

  const organizationId = text(input.organizationId, 36);
  const projectId = text(input.projectId, 36);
  const originalName = text(input.originalName, 220);
  const declaredMimeType = text(input.contentType, 255) || "application/octet-stream";
  const sizeBytes = Number(input.sizeBytes);
  const idempotencyKey = request.headers.get("idempotency-key")?.slice(0, 160) ?? "";
  if (!organizationId || !projectId || !originalName || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes || idempotencyKey.length < 8) {
    return Response.json({ error: "Invalid upload request" }, { status: 400 });
  }

  const { data, error } = await supabase.schema("artifacts").rpc("create_upload_record", {
    p_organization_id: organizationId,
    p_project_id: projectId,
    p_original_name: originalName,
    p_declared_mime_type: declaredMimeType,
    p_size_bytes: sizeBytes,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return Response.json({ error: "Upload is not permitted for this project" }, { status: 403 });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.storage_path || !row?.file_id) return Response.json({ error: "Unable to allocate upload" }, { status: 500 });

  const { data: signed, error: signedError } = await supabase.storage.from("project-artifacts").createSignedUploadUrl(row.storage_path);
  if (signedError || !signed?.token) return Response.json({ error: "Unable to create signed upload" }, { status: 500 });

  return Response.json({
    fileId: row.file_id,
    bucket: "project-artifacts",
    path: row.storage_path,
    token: signed.token,
    status: "quarantined",
  }, { headers: { "cache-control": "no-store" } });
}
