"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const statuses = new Set(["potential","reviewing","validated","reported","remediated","verified","false_positive","duplicate","accepted_risk"]);
const severities = new Set(["critical","high","medium","low","informational"]);
const evidenceTypes = new Set(["screenshot","log","source_code_reference","request_response","file","agent_observation","text","image"]);

function clean(value:FormDataEntryValue|null,max=4000){return String(value??"").trim().slice(0,max);}
function refresh(id:string,projectId:string){revalidatePath(`/app/findings/${id}`);revalidatePath("/app/findings");revalidatePath(`/app/projects/${projectId}`);revalidatePath("/app/activity");}

async function identity(){const supabase=await createClient();const {data}=await supabase.auth.getClaims();const userId=data?.claims?.sub;if(!userId)throw new Error("Unauthorized");return {supabase,userId};}

export async function updateFinding(formData:FormData){
  const {supabase}=await identity();
  const id=clean(formData.get("finding_id"),36);const organizationId=clean(formData.get("organization_id"),36);const projectId=clean(formData.get("project_id"),36);
  const title=clean(formData.get("title"),240);const severity=clean(formData.get("severity"),40);const status=clean(formData.get("status"),40);const confidenceRaw=clean(formData.get("confidence"),10);
  const affectedAsset=clean(formData.get("affected_asset"),1000);const category=clean(formData.get("category"),200);const impact=clean(formData.get("impact"),6000);const recommendation=clean(formData.get("recommendation"),6000);const description=clean(formData.get("description"),12000);
  if(!id||!organizationId||!projectId||!title||!severities.has(severity)||!statuses.has(status))return;
  const confidence=confidenceRaw===""?null:Number(confidenceRaw);if(confidence!==null&&(!Number.isFinite(confidence)||confidence<0||confidence>100))return;
  const now=new Date().toISOString();
  await supabase.schema("security").from("findings").update({title,severity,status,confidence,affected_asset:affectedAsset||null,category:category||null,impact:impact||null,recommendation:recommendation||null,description:description||null,validated_at:["validated","reported","remediated","verified"].includes(status)?now:null,resolved_at:["remediated","verified","false_positive","duplicate","accepted_risk"].includes(status)?now:null}).eq("id",id).eq("organization_id",organizationId).eq("project_id",projectId);
  refresh(id,projectId);
}

export async function addFindingEvidence(formData:FormData){
  const {supabase}=await identity();
  const findingId=clean(formData.get("finding_id"),36);const organizationId=clean(formData.get("organization_id"),36);const projectId=clean(formData.get("project_id"),36);const evidenceType=clean(formData.get("evidence_type"),40);const text=clean(formData.get("content"),20000);const sourceFileId=clean(formData.get("source_file_id"),36)||null;
  if(!findingId||!organizationId||!projectId||!evidenceTypes.has(evidenceType)||!text)return;
  await supabase.schema("security").rpc("create_finding_evidence",{p_organization_id:organizationId,p_project_id:projectId,p_finding_id:findingId,p_evidence_type:evidenceType,p_content:{kind:"text",text},p_source_file_id:sourceFileId});
  refresh(findingId,projectId);
}

export async function appendEvidenceVersion(formData:FormData){
  const {supabase}=await identity();
  const findingId=clean(formData.get("finding_id"),36);const organizationId=clean(formData.get("organization_id"),36);const projectId=clean(formData.get("project_id"),36);const evidenceId=clean(formData.get("evidence_id"),36);const text=clean(formData.get("content"),20000);
  if(!findingId||!organizationId||!projectId||!evidenceId||!text)return;
  await supabase.schema("security").rpc("append_finding_evidence_version",{p_organization_id:organizationId,p_evidence_id:evidenceId,p_content:{kind:"text",text}});
  refresh(findingId,projectId);
}
