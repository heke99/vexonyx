import "server-only";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function requireSuperadmin() {
  const client = await createClient();
  const { data: claims } = await client.auth.getClaims();
  const userId = claims?.claims?.sub;

  if (!userId) redirect("/admin-login");

  const { data: profile } = await client
    .schema("app")
    .from("profiles")
    .select("id,display_name,is_superadmin")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.is_superadmin) notFound();

  const admin = createAdminClient();
  if (!admin) throw new Error("Privileged server access is not configured.");

  return { admin, userId, profile };
}
