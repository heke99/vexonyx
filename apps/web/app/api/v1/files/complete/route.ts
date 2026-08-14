import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }

  const organizationId = text(input.organizationId);
  const projectId = text(input.projectId);
  const fileId = text(input.fileId);
  if (![organizationId, projectId, fileId].every((value) => uuidPattern.test(value))) {
    return Response.json({ error: "Invalid upload completion" }, { status: 400 });
  }

  const { data, error } = await supabase.schema("artifacts").rpc("finalize_upload", {
    p_organization_id: organizationId,
    p_project_id: projectId,
    p_file_id: fileId,
  });
  if (error) return Response.json({ error: "Unable to prepare this file for processing" }, { status: 403 });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.job_id) return Response.json({ error: "Unable to queue file processing" }, { status: 500 });

  return Response.json({ ok: true, fileId: row.file_id, status: "queued_for_checking" }, { headers: { "cache-control": "no-store" } });
}
