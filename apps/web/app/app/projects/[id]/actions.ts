"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const engagementTypes = new Set(["web_application","api","infrastructure","cloud","code_review","general_security_assessment"]);
const scopeTypes = new Set(["domain","subdomain","ip","cidr","application","repository","cloud_resource"]);
const severities = new Set(["critical","high","medium","low","informational"]);
const projectRoles = new Set(["member","viewer"]);

async function identity() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new Error("Unauthorized");
  return { supabase, userId };
}

async function requireOrganizationAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, organizationId: string) {
  const { data } = await supabase.schema("app").from("organization_members").select("role").eq("organization_id",organizationId).eq("user_id",userId).maybeSingle();
  if (!data || !["organization_owner","organization_admin"].includes(String(data.role))) throw new Error("Organization admin required");
}

function clean(value: FormDataEntryValue | null, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function refresh(projectId: string) {
  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath("/app");
  revalidatePath("/app/projects");
  revalidatePath("/app/projects/deleted");
  revalidatePath("/app/files");
  revalidatePath("/app/findings");
  revalidatePath("/app/reports");
  revalidatePath("/app/team");
  revalidatePath("/app/activity");
}

export async function renameProject(formData: FormData) {
  const { supabase } = await identity();
  const projectId = clean(formData.get("project_id"), 36); const organizationId = clean(formData.get("organization_id"), 36); const name = clean(formData.get("name"), 160);
  if (!projectId || !organizationId || !name) return;
  await supabase.schema("app").from("projects").update({ name }).eq("id", projectId).eq("organization_id", organizationId);
  refresh(projectId);
}

export async function setProjectArchive(formData: FormData) {
  const { supabase } = await identity();
  const projectId = clean(formData.get("project_id"), 36); const organizationId = clean(formData.get("organization_id"), 36); const mode = clean(formData.get("mode"), 20);
  if (!projectId || !organizationId || !["archive","restore"].includes(mode)) return;
  await supabase.schema("app").from("projects").update(mode === "archive" ? { status: "archived", archived_at: new Date().toISOString() } : { status: "active", archived_at: null }).eq("id", projectId).eq("organization_id", organizationId);
  refresh(projectId);
}

export async function duplicateProject(formData: FormData) {
  const { supabase, userId } = await identity();
  const projectId = clean(formData.get("project_id"),36); const organizationId = clean(formData.get("organization_id"),36);
  if (!projectId || !organizationId) return;
  const { data: source } = await supabase.schema("app").from("projects").select("name,description,visibility,metadata").eq("id",projectId).eq("organization_id",organizationId).is("deleted_at",null).maybeSingle();
  if (!source) return;
  const { data: copy, error } = await supabase.schema("app").from("projects").insert({ organization_id:organizationId, created_by:userId, name:`${source.name} Copy`.slice(0,160), description:source.description, visibility:source.visibility, metadata:source.metadata ?? {}, status:"active" }).select("id").single();
  if (!error && copy?.id) redirect(`/app/projects/${copy.id}`);
}

export async function softDeleteProject(formData: FormData) {
  const { supabase, userId } = await identity();
  const projectId = clean(formData.get("project_id"),36); const organizationId = clean(formData.get("organization_id"),36);
  if (!projectId || !organizationId) return;
  await requireOrganizationAdmin(supabase,userId,organizationId);
  const { error } = await supabase.schema("app").from("projects").update({ deleted_at:new Date().toISOString(), status:"archived" }).eq("id",projectId).eq("organization_id",organizationId);
  if (!error) redirect("/app/projects/deleted");
}

export async function restoreDeletedProject(formData: FormData) {
  const { supabase, userId } = await identity();
  const projectId = clean(formData.get("project_id"),36); const organizationId = clean(formData.get("organization_id"),36);
  if (!projectId || !organizationId) return;
  await requireOrganizationAdmin(supabase,userId,organizationId);
  const { error } = await supabase.schema("app").from("projects").update({ deleted_at:null, archived_at:null, status:"active" }).eq("id",projectId).eq("organization_id",organizationId).not("deleted_at","is",null);
  refresh(projectId);
  if (!error) redirect(`/app/projects/${projectId}`);
}

export async function purgeProject(formData: FormData) {
  const { supabase, userId } = await identity();
  const projectId = clean(formData.get("project_id"),36); const organizationId = clean(formData.get("organization_id"),36); const confirmation = clean(formData.get("confirmation"),160);
  if (!projectId || !organizationId || !confirmation) return;
  await requireOrganizationAdmin(supabase,userId,organizationId);
  const { data: project } = await supabase.schema("app").from("projects").select("name,deleted_at").eq("id",projectId).eq("organization_id",organizationId).maybeSingle();
  if (!project?.deleted_at || confirmation !== project.name) return;
  const { error } = await supabase.schema("app").from("projects").delete().eq("id",projectId).eq("organization_id",organizationId);
  refresh(projectId);
  if (!error) redirect("/app/projects/deleted");
}

export async function createEngagement(formData: FormData) {
  const { supabase, userId } = await identity();
  const projectId = clean(formData.get("project_id"), 36); const organizationId = clean(formData.get("organization_id"), 36); const name = clean(formData.get("name"), 160); const type = clean(formData.get("type"), 80);
  if (!projectId || !organizationId || !name || !engagementTypes.has(type)) return;
  await supabase.schema("security").from("engagements").insert({ organization_id: organizationId, project_id: projectId, created_by: userId, name, type, status: "draft" });
  refresh(projectId);
}

export async function addScope(formData: FormData) {
  const { supabase, userId } = await identity();
  const projectId = clean(formData.get("project_id"), 36); const organizationId = clean(formData.get("organization_id"), 36); const engagementId = clean(formData.get("engagement_id"), 36); const type = clean(formData.get("type"), 40); const value = clean(formData.get("value"), 2048); const excluded = clean(formData.get("excluded"), 10) === "true";
  if (!projectId || !organizationId || !engagementId || !value || !scopeTypes.has(type)) return;
  await supabase.schema("security").from("engagement_scope").insert({ organization_id: organizationId, project_id: projectId, engagement_id: engagementId, created_by: userId, type, value, normalized_value: value, is_excluded: excluded });
  refresh(projectId);
}

export async function createAuthorization(formData: FormData) {
  const { supabase, userId } = await identity();
  const projectId = clean(formData.get("project_id"), 36); const organizationId = clean(formData.get("organization_id"), 36); const engagementId = clean(formData.get("engagement_id"), 36); const validUntil = clean(formData.get("valid_until"), 40); const notes = clean(formData.get("notes"), 3000);
  if (!projectId || !organizationId || !engagementId || !validUntil) return;
  const parsedUntil = new Date(validUntil); if (!Number.isFinite(parsedUntil.getTime()) || parsedUntil <= new Date()) return;
  await supabase.schema("security").from("authorization_records").insert({ organization_id: organizationId, project_id: projectId, engagement_id: engagementId, status: "pending_review", valid_from: new Date().toISOString(), valid_until: parsedUntil.toISOString(), uploaded_by: userId, notes: notes || null, classification: "restricted" });
  refresh(projectId);
}

export async function activateAuthorization(formData: FormData) {
  const { supabase, userId } = await identity();
  const projectId = clean(formData.get("project_id"), 36); const organizationId = clean(formData.get("organization_id"), 36); const authorizationId = clean(formData.get("authorization_id"), 36); const engagementId = clean(formData.get("engagement_id"), 36);
  if (!projectId || !organizationId || !authorizationId || !engagementId) return;
  const now = new Date().toISOString();
  const { data: auth } = await supabase.schema("security").from("authorization_records").select("valid_until").eq("id", authorizationId).eq("organization_id", organizationId).eq("engagement_id", engagementId).maybeSingle();
  if (!auth?.valid_until || new Date(auth.valid_until) <= new Date()) return;
  const { error } = await supabase.schema("security").from("authorization_records").update({ status: "active", reviewed_by: userId, valid_from: now }).eq("id", authorizationId).eq("organization_id", organizationId);
  if (!error) await supabase.schema("security").from("engagements").update({ status: "active" }).eq("id", engagementId).eq("organization_id", organizationId);
  refresh(projectId);
}

export async function addNote(formData: FormData) {
  const { supabase, userId } = await identity();
  const projectId = clean(formData.get("project_id"), 36); const organizationId = clean(formData.get("organization_id"), 36); const content = clean(formData.get("content"), 20000);
  if (!projectId || !organizationId || !content) return;
  await supabase.schema("app").from("project_notes").insert({ organization_id: organizationId, project_id: projectId, created_by: userId, content });
  refresh(projectId);
}

export async function addFinding(formData: FormData) {
  const { supabase, userId } = await identity();
  const projectId = clean(formData.get("project_id"), 36); const organizationId = clean(formData.get("organization_id"), 36); const engagementId = clean(formData.get("engagement_id"), 36) || null; const title = clean(formData.get("title"), 240); const severity = clean(formData.get("severity"), 40); const summary = clean(formData.get("summary"), 4000);
  if (!projectId || !organizationId || !title || !severities.has(severity)) return;
  await supabase.schema("security").from("findings").insert({ organization_id: organizationId, project_id: projectId, engagement_id: engagementId, created_by: userId, title, severity, summary: summary || null, status: "potential", first_observed_at: new Date().toISOString() });
  refresh(projectId);
}

export async function createReport(formData: FormData) {
  const { supabase, userId } = await identity();
  const projectId = clean(formData.get("project_id"),36); const organizationId = clean(formData.get("organization_id"),36); const engagementId = clean(formData.get("engagement_id"),36) || null; const title = clean(formData.get("title"),240);
  if (!projectId || !organizationId || !title) return;
  await supabase.schema("reports").from("reports").insert({ organization_id:organizationId, project_id:projectId, engagement_id:engagementId, created_by:userId, title, status:"draft" });
  refresh(projectId);
}

export async function addProjectMember(formData: FormData) {
  const { supabase, userId } = await identity();
  const projectId = clean(formData.get("project_id"),36); const organizationId = clean(formData.get("organization_id"),36); const targetUserId = clean(formData.get("user_id"),36); const role = clean(formData.get("role"),20);
  if (!projectId || !organizationId || !targetUserId || !projectRoles.has(role)) return;
  await requireOrganizationAdmin(supabase,userId,organizationId);
  await supabase.schema("app").from("project_members").upsert({ project_id:projectId, organization_id:organizationId, user_id:targetUserId, role }, { onConflict:"project_id,user_id" });
  refresh(projectId);
}

export async function removeProjectMember(formData: FormData) {
  const { supabase, userId } = await identity();
  const projectId = clean(formData.get("project_id"),36); const organizationId = clean(formData.get("organization_id"),36); const targetUserId = clean(formData.get("user_id"),36);
  if (!projectId || !organizationId || !targetUserId) return;
  await requireOrganizationAdmin(supabase,userId,organizationId);
  await supabase.schema("app").from("project_members").delete().eq("project_id",projectId).eq("organization_id",organizationId).eq("user_id",targetUserId);
  refresh(projectId);
}
