"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const sectionPositions:Record<string,number>={cover:10,executive_summary:20,scope:30,methodology:40,overall_risk:50,findings:60,evidence:70,recommendations:80,limitations:90,appendix:100};
const formats=new Set(["pdf","docx","markdown","json"]);

function clean(value:FormDataEntryValue|null,max=12000){return String(value??"").trim().slice(0,max);}
async function client(){const supabase=await createClient();const {data}=await supabase.auth.getClaims();if(!data?.claims?.sub)throw new Error("Unauthorized");return supabase;}
function refresh(id:string){revalidatePath(`/app/reports/${id}`);revalidatePath("/app/reports");revalidatePath("/app/activity");}

export async function updateReport(formData:FormData){
  const supabase=await client();const id=clean(formData.get("report_id"),36);const organizationId=clean(formData.get("organization_id"),36);const title=clean(formData.get("title"),240);const status=clean(formData.get("status"),20);
  if(!id||!organizationId||!title||!["draft","ready","archived"].includes(status))return;
  await supabase.schema("reports").from("reports").update({title,status,updated_at:new Date().toISOString()}).eq("id",id).eq("organization_id",organizationId);refresh(id);
}

export async function saveReportSection(formData:FormData){
  const supabase=await client();const reportId=clean(formData.get("report_id"),36);const organizationId=clean(formData.get("organization_id"),36);const sectionKey=clean(formData.get("section_key"),60);const title=clean(formData.get("title"),240);const text=clean(formData.get("content"),30000);
  const position=sectionPositions[sectionKey];if(!reportId||!organizationId||position==null||!title)return;
  await supabase.schema("reports").from("report_sections").upsert({organization_id:organizationId,report_id:reportId,section_key:sectionKey,title,position,content:{kind:"markdown",text},updated_at:new Date().toISOString()},{onConflict:"report_id,section_key"});refresh(reportId);
}

export async function deleteReportSection(formData:FormData){
  const supabase=await client();const reportId=clean(formData.get("report_id"),36);const organizationId=clean(formData.get("organization_id"),36);const sectionId=clean(formData.get("section_id"),36);if(!reportId||!organizationId||!sectionId)return;
  await supabase.schema("reports").from("report_sections").delete().eq("id",sectionId).eq("report_id",reportId).eq("organization_id",organizationId);refresh(reportId);
}

export async function snapshotReport(formData:FormData){
  const supabase=await client();const reportId=clean(formData.get("report_id"),36);const organizationId=clean(formData.get("organization_id"),36);if(!reportId||!organizationId)return;
  await supabase.schema("reports").rpc("snapshot_report",{p_organization_id:organizationId,p_report_id:reportId});refresh(reportId);
}

export async function requestReportExport(formData:FormData){
  const supabase=await client();const reportId=clean(formData.get("report_id"),36);const organizationId=clean(formData.get("organization_id"),36);const reportVersionId=clean(formData.get("report_version_id"),36);const format=clean(formData.get("format"),20);if(!reportId||!organizationId||!reportVersionId||!formats.has(format))return;
  await supabase.schema("reports").rpc("request_report_export",{p_organization_id:organizationId,p_report_id:reportId,p_report_version_id:reportVersionId,p_format:format,p_idempotency_key:crypto.randomUUID()});refresh(reportId);
}
