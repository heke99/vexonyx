"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireSuperadmin() {
  const client = await createClient();
  const { data: claims } = await client.auth.getClaims();
  const id = claims?.claims?.sub;
  if (!id) throw new Error("Unauthorized");
  const { data } = await client.schema("app").from("profiles").select("is_superadmin").eq("id", id).single();
  if (!data?.is_superadmin) throw new Error("Forbidden");
  const admin = createAdminClient();
  if (!admin) throw new Error("Control-plane secret is not configured");
  return { admin, id };
}

export async function setIncidentMode(formData: FormData) {
  const { admin, id } = await requireSuperadmin();
  const mode = String(formData.get("mode") ?? "normal");
  if (!["normal","degraded","maintenance","security_lockdown"].includes(mode)) throw new Error("Invalid mode");
  const patch = mode === "security_lockdown" ? { incident_mode: mode, external_tools_enabled: false, sandbox_scheduling_enabled: false, external_network_enabled: false, updated_by: id } : { incident_mode: mode, updated_by: id };
  const { error } = await admin.schema("operations").from("system_state").update(patch).eq("singleton", true);
  if (error) throw error;
  await admin.schema("audit").from("audit_logs").insert({ actor_user_id: id, actor_type: "superadmin", action: "system.incident_mode_changed", resource_type: "system_state", metadata: { mode } });
  revalidatePath("/admin");
}
