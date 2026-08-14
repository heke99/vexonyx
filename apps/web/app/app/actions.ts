"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 58);

export async function createOrganization(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (!userId || name.length < 2) return;
  const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`;
  await supabase.schema("app").from("organizations").insert({ name, slug, created_by: userId });
  revalidatePath("/app");
}

export async function createProject(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const name = String(formData.get("name") ?? "").trim().slice(0, 160);
  const organizationId = String(formData.get("organization_id") ?? "");
  if (!userId || !name || !organizationId) return;
  await supabase.schema("app").from("projects").insert({ name, organization_id: organizationId, created_by: userId });
  revalidatePath("/app"); revalidatePath("/app/projects");
}
