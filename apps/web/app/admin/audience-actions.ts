"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/admin/guard";

function text(formData:FormData,key:string,max=200){return String(formData.get(key)??"").trim().slice(0,max);}

async function audit(admin:Awaited<ReturnType<typeof requireSuperadmin>>["admin"],userId:string,action:string,resourceType:string,resourceId?:string|null,metadata?:Record<string,unknown>){
  const {error}=await admin.schema("audit").from("audit_logs").insert({actor_user_id:userId,actor_type:"superadmin",action,resource_type:resourceType,resource_id:resourceId||null,metadata:metadata??{}});
  if(error)throw error;
}

export async function createAudienceExport(formData:FormData){
  const {admin,userId}=await requireSuperadmin();
  const exportType=text(formData,"export_type",20);
  if(!["waitlist","users","customers","audience"].includes(exportType))throw new Error("Invalid export type");
  const {data,error}=await admin.schema("marketing").from("exports").insert({requested_by:userId,export_type:exportType,status:"queued"}).select("id").single();
  if(error)throw error;
  const job=await admin.schema("operations").from("jobs").insert({
    queue_name:"marketing",
    organization_id:null,
    priority:3,
    status:"queued",
    payload:{job_type:"marketing_export",export_id:data.id},
    idempotency_key:`marketing-export:${data.id}`,
    max_attempts:5,
    available_at:new Date().toISOString(),
  });
  if(job.error){
    await admin.schema("marketing").from("exports").update({status:"failed",error_code:"queue_insert_failed",completed_at:new Date().toISOString()}).eq("id",data.id);
    throw job.error;
  }
  await audit(admin,userId,"marketing.export_requested","marketing_export",data.id,{export_type:exportType,queue:"marketing"});
  revalidatePath("/admin/audience");
}

export async function createBroadcastDraft(formData:FormData){
  const {admin,userId}=await requireSuperadmin();
  const subject=text(formData,"subject",200);
  const lifecycleStage=text(formData,"lifecycle_stage",30)||"customer";
  if(subject.length<3)throw new Error("Subject required");
  if(!["waitlist","invited","customer","lead"].includes(lifecycleStage))throw new Error("Invalid audience stage");
  const {data,error}=await admin.schema("marketing").from("broadcasts").insert({
    created_by:userId,
    provider:"resend",
    audience_filter:{lifecycle_stage:lifecycleStage,marketing_consent:true,unsubscribed:false},
    subject,
    status:"draft",
  }).select("id").single();
  if(error)throw error;
  await audit(admin,userId,"marketing.broadcast_draft_created","broadcast",data.id,{subject,lifecycle_stage:lifecycleStage});
  revalidatePath("/admin/audience");
}

export async function inviteWaitlistEntry(formData:FormData){
  const {admin,userId}=await requireSuperadmin();
  const entryId=text(formData,"entry_id",64);
  if(!/^[0-9a-f-]{36}$/i.test(entryId))throw new Error("Invalid waitlist entry");

  const token=randomBytes(32).toString("base64url");
  const tokenHash=createHash("sha256").update(token).digest("hex");
  const origin=(process.env.NEXT_PUBLIC_APP_URL||"https://www.vexonyx.com").replace(/\/$/,"");
  const invitationUrl=new URL("/waitlist/access",origin);
  invitationUrl.searchParams.set("entry",entryId);
  invitationUrl.searchParams.set("token",token);

  const issued=await admin.schema("launch").rpc("issue_waitlist_invitation",{
    p_entry_id:entryId,
    p_token_hash:tokenHash,
    p_invitation_url:invitationUrl.toString(),
  });
  if(issued.error)throw new Error(issued.error.message.includes("auth_user_already_exists")?"This email already has a VEXONYX account.":"Unable to issue waitlist invitation.");
  const row=Array.isArray(issued.data)?issued.data[0]:issued.data;
  await audit(admin,userId,"waitlist.invitation_issued","waitlist_entry",entryId,{invitation_id:row?.invitation_id??null,delivery:"queued"});
  revalidatePath("/admin/audience");
}
