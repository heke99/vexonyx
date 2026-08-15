import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderDocx, renderPdf } from "@/lib/reports/render";
import { isAuthorizedWorkerRequest } from "@/lib/workers/internal-auth";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
const CANARY_MARKER="VEXONYX_RENDER_CANARY";
const BUCKET="project-artifacts";

function sha256(bytes:Uint8Array){return createHash("sha256").update(bytes).digest("hex")}
function validPdf(bytes:Uint8Array){const b=Buffer.from(bytes);return b.length>100&&b.subarray(0,8).toString("ascii").startsWith("%PDF-")&&b.subarray(Math.max(0,b.length-32)).toString("ascii").includes("%%EOF")&&b.toString("latin1").includes(CANARY_MARKER)}
function validDocx(bytes:Uint8Array){const b=Buffer.from(bytes);return b.length>100&&b[0]===0x50&&b[1]===0x4b&&b[2]===0x03&&b[3]===0x04&&b.includes(Buffer.from("[Content_Types].xml"))&&b.includes(Buffer.from("word/document.xml"))&&b.includes(Buffer.from(CANARY_MARKER))}

async function maybeRunRenderCanary(admin:AdminClient){
 if(process.env.VERCEL_ENV!=="production")return{status:"skipped_nonproduction"};
 const latest=await admin.schema("audit").from("audit_logs").select("created_at,metadata").eq("action","runtime.report_renderer_canary").order("created_at",{ascending:false}).limit(1).maybeSingle();
 const latestAt=latest.data?.created_at?new Date(latest.data.created_at).getTime():0;
 const meta=latest.data?.metadata&&typeof latest.data.metadata==="object"?latest.data.metadata as Record<string,unknown>:{};
 const previousPassed=meta.status==="passed"&&meta.cleanupVerified===true&&meta.storageRoundTrip===true;
 const interval=previousPassed?24*60*60*1000:15*60*1000;
 if(latestAt&&Date.now()-latestAt<interval)return{status:"skipped_recent",previous:meta.status||"unknown"};

 const canaryId=`render-${randomUUID()}`;
 const snapshot={title:CANARY_MARKER,generatedAt:new Date().toISOString(),sections:[{heading:"Renderer health",body:"Private storage round-trip"}]};
 const pdf=renderPdf(snapshot);const docx=renderDocx(snapshot);
 const pdfPath=`_canary/render/${canaryId}.pdf`;const docxPath=`_canary/render/${canaryId}.docx`;const paths=[pdfPath,docxPath];
 let cleanupVerified=false;
 try{
  if(!validPdf(pdf)||!validDocx(docx))throw new Error("renderer_output_signature_invalid");
  const pdfUpload=await admin.storage.from(BUCKET).upload(pdfPath,pdf,{contentType:"application/pdf",upsert:false,cacheControl:"private, max-age=0"});if(pdfUpload.error)throw pdfUpload.error;
  const docxUpload=await admin.storage.from(BUCKET).upload(docxPath,docx,{contentType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",upsert:false,cacheControl:"private, max-age=0"});if(docxUpload.error)throw docxUpload.error;
  const [pdfDownload,docxDownload]=await Promise.all([admin.storage.from(BUCKET).download(pdfPath),admin.storage.from(BUCKET).download(docxPath)]);
  if(pdfDownload.error||!pdfDownload.data||docxDownload.error||!docxDownload.data)throw new Error("renderer_canary_download_failed");
  const downloadedPdf=new Uint8Array(await pdfDownload.data.arrayBuffer());const downloadedDocx=new Uint8Array(await docxDownload.data.arrayBuffer());
  const storageRoundTrip=sha256(downloadedPdf)===sha256(pdf)&&sha256(downloadedDocx)===sha256(docx)&&validPdf(downloadedPdf)&&validDocx(downloadedDocx);
  if(!storageRoundTrip)throw new Error("renderer_canary_roundtrip_mismatch");
  const removed=await admin.storage.from(BUCKET).remove(paths);if(removed.error)throw removed.error;cleanupVerified=true;
  const metadata={status:"passed",storageRoundTrip:true,cleanupVerified,pdfBytes:pdf.byteLength,docxBytes:docx.byteLength,pdfSha256:sha256(pdf),docxSha256:sha256(docx),checkedAt:new Date().toISOString()};
  await admin.schema("audit").from("audit_logs").insert({actor_type:"system",action:"runtime.report_renderer_canary",resource_type:"renderer",request_id:canaryId,metadata});
  return metadata;
 }catch(error){
  if(!cleanupVerified){const removed=await admin.storage.from(BUCKET).remove(paths);cleanupVerified=!removed.error;}
  const metadata={status:"failed",reason:error instanceof Error?error.message.slice(0,300):"renderer_canary_failed",storageRoundTrip:false,cleanupVerified,checkedAt:new Date().toISOString()};
  await admin.schema("audit").from("audit_logs").insert({actor_type:"system",action:"runtime.report_renderer_canary",resource_type:"renderer",request_id:canaryId,metadata});
  console.error("report_renderer_canary_failed",metadata);return metadata;
 }
}

export async function POST(request:Request){
 const admin=createAdminClient();if(!admin)return NextResponse.json({error:"worker_unavailable"},{status:503});
 if(!(await isAuthorizedWorkerRequest(request,admin)))return NextResponse.json({error:"unauthorized"},{status:401});
 const {data:candidates,error}=await admin.schema("reports").from("render_jobs").select("id,organization_id,report_id,format,renderer_version,input_snapshot,attempt_count").in("status",["queued","failed"]).lt("attempt_count",5).order("created_at").limit(5);if(error)return NextResponse.json({error:"queue_read_failed"},{status:500});
 const results=[] as Array<Record<string,unknown>>;
 for(const job of candidates??[]){
  const claimed=await admin.schema("reports").from("render_jobs").update({status:"rendering",attempt_count:Number(job.attempt_count)+1,updated_at:new Date().toISOString()}).eq("id",job.id).in("status",["queued","failed"]).select("id").maybeSingle();if(!claimed.data)continue;
  try{
   const bytes=job.format==="pdf"?renderPdf(job.input_snapshot):renderDocx(job.input_snapshot);const ext=job.format;const path=`${job.organization_id}/reports/${job.report_id}/${job.id}.${ext}`;const digest=sha256(bytes);
   const upload=await admin.storage.from(BUCKET).upload(path,bytes,{contentType:ext==="pdf"?"application/pdf":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",upsert:false,cacheControl:"private, max-age=0"});if(upload.error)throw upload.error;
   const done=await admin.schema("reports").from("render_jobs").update({status:"ready",output_storage_path:path,sha256:digest,error_code:null,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",job.id);if(done.error)throw done.error;
   results.push({id:job.id,status:"ready",sha256:digest});
  }catch(e){const attempts=Number(job.attempt_count)+1;await admin.schema("reports").from("render_jobs").update({status:attempts>=5?"dead_letter":"failed",error_code:e instanceof Error?e.message.slice(0,120):"render_failed",updated_at:new Date().toISOString()}).eq("id",job.id);results.push({id:job.id,status:attempts>=5?"dead_letter":"failed"});}
 }
 const canary=results.length===0?await maybeRunRenderCanary(admin):{status:"skipped_busy"};
 return NextResponse.json({processed:results.length,results,canary},{headers:{"cache-control":"no-store"}});
}

export async function GET(request:Request){return POST(request);}