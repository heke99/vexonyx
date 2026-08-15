"use server";

import { revalidatePath } from "next/cache";
import { getWorkspace } from "@/lib/workspace";

export async function requestReportRender(formData:FormData){
 const ws=await getWorkspace();if(!ws?.organizationId)throw new Error("Organization required");const reportId=String(formData.get("report_id")??"");const format=String(formData.get("format")??"");if(!/^[0-9a-f-]{36}$/i.test(reportId)||!["pdf","docx"].includes(format))throw new Error("Invalid report render request");
 const [report,sections,version]=await Promise.all([
  ws.supabase.schema("reports").from("reports").select("id,organization_id,project_id,engagement_id,title,status,created_at,updated_at").eq("id",reportId).eq("organization_id",ws.organizationId).maybeSingle(),
  ws.supabase.schema("reports").from("report_sections").select("section_key,position,title,content,updated_at").eq("report_id",reportId).eq("organization_id",ws.organizationId).order("position"),
  ws.supabase.schema("reports").from("report_versions").select("version,snapshot,created_at").eq("report_id",reportId).eq("organization_id",ws.organizationId).order("version",{ascending:false}).limit(1).maybeSingle()
 ]);if(report.error||!report.data)throw new Error("Report not found");if(sections.error)throw sections.error;if(version.error)throw version.error;
 const snapshot={report:report.data,sections:sections.data??[],latest_version:version.data??null,generated_at:new Date().toISOString(),renderer_contract:"vexonyx-report-v1"};
 const inserted=await ws.supabase.schema("reports").from("render_jobs").insert({organization_id:ws.organizationId,report_id:reportId,requested_by:ws.userId,format,renderer_version:"vexonyx-renderer-1",status:"queued",input_snapshot:snapshot}).select("id").single();if(inserted.error)throw inserted.error;revalidatePath("/app/reports");
}
