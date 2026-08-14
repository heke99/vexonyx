"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const clean=(value:FormDataEntryValue|null,max=40)=>String(value??"").trim().slice(0,max);

export async function revokeInvitation(formData:FormData){
  const supabase=await createClient();const {data}=await supabase.auth.getClaims();if(!data?.claims?.sub)throw new Error("Unauthorized");
  const organizationId=clean(formData.get("organization_id"),36);const invitationId=clean(formData.get("invitation_id"),36);if(!organizationId||!invitationId)return;
  await supabase.schema("app").rpc("revoke_organization_invitation",{p_organization_id:organizationId,p_invitation_id:invitationId});
  revalidatePath("/app/team");
}
