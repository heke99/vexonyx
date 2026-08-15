import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderDocx, renderPdf } from "@/lib/reports/render";
import { isAuthorizedWorkerRequest } from "@/lib/workers/internal-auth";

export async function POST(request:Request){
 const admin=createAdminClient();if(!admin)return NextResponse.json({error:"worker_unavailable"},{status:503});
 if(!(await isAuthorizedWorkerRequest(request,admin)))return NextResponse.json({error:"unauthorized"},{status:401});
 const {data:candidates,error}=await admin.schema("reports").from("render_jobs").select("id,organization_id,report_id,format,renderer_version,input_snapshot,attempt_count").in("status",["queued","failed"]).lt("attempt_count",5).order("created_at").limit(5);if(error)return NextResponse.json({error:"queue_read_failed"},{status:500});
 const results=[] as Array<Record<string,unknown>>;
 for(const job of candidates??[]){
  const claimed=await admin.schema("reports").from("render_jobs").update({status:"rendering",attempt_count:Number(job.attempt_count)+1,updated_at:new Date().toISOString()}).eq("id",job.id).in("status",["queued","failed"]).select("id").maybeSingle();if(!claimed.data)continue;
  try{
   const bytes=job.format==="pdf"?renderPdf(job.input_snapshot):renderDocx(job.input_snapshot);const ext=job.format;const path=`${job.organization_id}/reports/${job.report_id}/${job.id}.${ext}`;const digest=createHash("sha256").update(bytes).digest("hex");
   const upload=await admin.storage.from("project-artifacts").upload(path,bytes,{contentType:ext==="pdf"?"application/pdf":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",upsert:false,cacheControl:"private, max-age=0"});if(upload.error)throw upload.error;
   const done=await admin.schema("reports").from("render_jobs").update({status:"ready",output_storage_path:path,sha256:digest,error_code:null,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",job.id);if(done.error)throw done.error;
   results.push({id:job.id,status:"ready",sha256:digest});
  }catch(e){const attempts=Number(job.attempt_count)+1;await admin.schema("reports").from("render_jobs").update({status:attempts>=5?"dead_letter":"failed",error_code:e instanceof Error?e.message.slice(0,120):"render_failed",updated_at:new Date().toISOString()}).eq("id",job.id);results.push({id:job.id,status:attempts>=5?"dead_letter":"failed"});}
 }
 return NextResponse.json({processed:results.length,results},{headers:{"cache-control":"no-store"}});
}

export async function GET(request:Request){return POST(request);}
