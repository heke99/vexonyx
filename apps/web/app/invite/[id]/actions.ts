"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function acceptInvitation(formData:FormData){
  const invitationId=String(formData.get("invitation_id")??"").trim();
  const token=String(formData.get("token")??"").trim();
  if(!uuidPattern.test(invitationId)||token.length!==64)redirect("/login");
  const supabase=await createClient();
  const {data:claims}=await supabase.auth.getClaims();
  if(!claims?.claims?.sub){
    const next=`/invite/${invitationId}?token=${encodeURIComponent(token)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  const {data,error}=await supabase.schema("app").rpc("accept_organization_invitation",{p_invitation_id:invitationId,p_raw_token:token});
  if(error){
    const next=`/invite/${invitationId}?token=${encodeURIComponent(token)}&error=invalid`;
    redirect(next);
  }
  const row=Array.isArray(data)?data[0]:data;
  revalidatePath("/app/team");
  redirect(row?.organization_id?"/app/team?joined=1":"/app");
}
