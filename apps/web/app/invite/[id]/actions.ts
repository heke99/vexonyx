"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function acceptInvitation(formData: FormData) {
  const invitationId = String(formData.get("invitation_id") ?? "").trim().slice(0, 36);
  const token = String(formData.get("token") ?? "").trim().slice(0, 64);
  if (!/^[0-9a-f-]{36}$/i.test(invitationId) || !/^[0-9a-f]{64}$/i.test(token)) redirect("/login?error=access");

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect(`/login?next=${encodeURIComponent(`/invite/${invitationId}?token=${token}`)}`);

  const { error } = await supabase.schema("app").rpc("accept_organization_invitation", {
    p_invitation_id: invitationId,
    p_raw_token: token,
  });
  if (error) redirect(`/invite/${invitationId}?token=${token}&error=invalid`);
  redirect("/app");
}
