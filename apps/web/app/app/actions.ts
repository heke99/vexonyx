"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 58);

export async function createOrganization(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (!userId || name.length < 2) return;
  const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`;
  const { error } = await supabase.schema("app").from("organizations").insert({ name, slug, created_by: userId });
  if (error) throw new Error("Unable to create organization.");
  revalidatePath("/app");
}

export async function createProject(formData: FormData) {
  const ws = await getWorkspace();
  const name = String(formData.get("name") ?? "").trim().slice(0, 160);
  const requestedOrganizationId = String(formData.get("organization_id") ?? "");
  if (!ws?.organizationId || !name || requestedOrganizationId !== ws.organizationId || ws.role === "viewer") return;
  const { data: project, error } = await ws.supabase.schema("app").from("projects").insert({ name, organization_id: ws.organizationId, created_by: ws.userId }).select("id").single();
  if (error || !project?.id) throw new Error("Unable to create project.");
  revalidatePath("/app");
  revalidatePath("/app/projects");
  redirect(`/app/projects/${project.id}`);
}
