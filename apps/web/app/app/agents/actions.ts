"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const clean=(value:FormDataEntryValue|null,max=4000)=>String(value??"").trim().slice(0,max);
function refresh(runId?:string){revalidatePath("/app/agents");if(runId)revalidatePath(`/app/agents/${runId}`);revalidatePath("/app/activity");}

export async function startPreGpuAgentRun(formData:FormData){
  const supabase=await createClient();const {data}=await supabase.auth.getClaims();if(!data?.claims?.sub)throw new Error("Unauthorized");
  const organizationId=clean(formData.get("organization_id"),36);const projectId=clean(formData.get("project_id"),36);const engagementId=clean(formData.get("engagement_id"),36)||null;const objective=clean(formData.get("objective"),4000);const requiresApproval=clean(formData.get("requires_approval"),10)==="true";
  if(!organizationId||!projectId||objective.length<3)return;
  const {data:result,error}=await supabase.schema("ai").rpc("start_pre_gpu_agent_run",{p_organization_id:organizationId,p_project_id:projectId,p_engagement_id:engagementId,p_objective:objective,p_requires_approval:requiresApproval,p_idempotency_key:crypto.randomUUID()});
  if(error)throw new Error("Unable to start agent run. Check the project, authorization and workspace limits.");
  const row=Array.isArray(result)?result[0]:result;refresh(row?.run_id);
  if(row?.run_id)redirect(`/app/agents/${row.run_id}`);
}

export async function advancePreGpuAgentRun(formData:FormData){
  const supabase=await createClient();const {data}=await supabase.auth.getClaims();if(!data?.claims?.sub)throw new Error("Unauthorized");
  const organizationId=clean(formData.get("organization_id"),36);const runId=clean(formData.get("run_id"),36);if(!organizationId||!runId)return;
  await supabase.schema("ai").rpc("advance_pre_gpu_agent_run",{p_organization_id:organizationId,p_run_id:runId});refresh(runId);
}

export async function reviewAgentApproval(formData:FormData){
  const supabase=await createClient();const {data}=await supabase.auth.getClaims();if(!data?.claims?.sub)throw new Error("Unauthorized");
  const organizationId=clean(formData.get("organization_id"),36);const approvalId=clean(formData.get("approval_id"),36);const runId=clean(formData.get("run_id"),36);const decision=clean(formData.get("decision"),20);const reason=clean(formData.get("reason"),2000)||null;
  if(!organizationId||!approvalId||!["approved","rejected"].includes(decision))return;
  await supabase.schema("security").rpc("review_agent_approval",{p_organization_id:organizationId,p_approval_request_id:approvalId,p_decision:decision,p_reason:reason});refresh(runId);
}
