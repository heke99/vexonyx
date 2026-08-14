import { createClient } from "@/lib/supabase/server";

export async function getWorkspace() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;
  const { data: memberships } = await supabase.schema("app").from("organization_members").select("organization_id,role").eq("user_id", userId).limit(1);
  const membership = memberships?.[0];
  if (!membership) return { userId, organizationId: null, role: null, supabase };
  return { userId, organizationId: membership.organization_id as string, role: membership.role as string, supabase };
}
