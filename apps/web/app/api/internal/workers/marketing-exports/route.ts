import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedWorkerRequest } from "@/lib/workers/internal-auth";

function csvCell(v:unknown){const s=String(v??"");return `"${s.replaceAll('"','""')}"`;}
function csv(rows:Record<string,unknown>[],columns:string[]){return [columns.map(csvCell).join(","),...rows.map(r=>columns.map(c=>csvCell(r[c])).join(","))].join("\r\n");}

export async function POST(request:Request){
 const admin=createAdminClient();if(!admin)return NextResponse.json({error:"worker_unavailable"},{status:503});
 if(!(await isAuthorizedWorkerRequest(request,admin)))return NextResponse.json({error:"unauthorized"},{status:401});
 const workerId=`marketing-${randomUUID()}`;
 const claimed=await admin.schema("operations").rpc("claim_jobs",{p_queue_name:"marketing",p_worker_id:workerId,p_limit:5,p_lease_seconds:300});
 if(claimed.error)return NextResponse.json({error:"marketing_queue_claim_failed"},{status:500});
 const results=[] as Array<Record<string,unknown>>;
 for(const job of claimed.data??[]){
  const jobId=String(job.job_id);const generation=Number(job.lease_generation);const attempt=Number(job.attempt);const payload=job.payload&&typeof job.payload==="object"?job.payload as Record<string,unknown>:{};const exportId=String(payload.export_id||"");
  if(payload.job_type!=="marketing_export"||!exportId){await admin.schema("operations").rpc("finish_job",{p_job_id:jobId,p_worker_id:workerId,p_lease_generation:generation,p_success:false,p_error:{code:"invalid_marketing_export_payload"}});results.push({jobId,status:"failed",reason:"invalid_payload"});continue;}
  const started=await admin.schema("operations").rpc("start_job",{p_job_id:jobId,p_worker_id:workerId,p_lease_generation:generation});if(started.error||started.data!==true)continue;
  try{
   const exportRow=await admin.schema("marketing").from("exports").select("id,export_type,filters,status").eq("id",exportId).maybeSingle();if(exportRow.error||!exportRow.data)throw new Error("marketing_export_not_found");
   if(exportRow.data.status==="ready"){await admin.schema("operations").rpc("finish_job",{p_job_id:jobId,p_worker_id:workerId,p_lease_generation:generation,p_success:true,p_error:null});results.push({id:exportId,status:"ready",idempotent:true});continue;}
   await admin.schema("marketing").from("exports").update({status:"running",error_code:null,completed_at:null}).eq("id",exportId);
   let rows:Record<string,unknown>[]=[];let columns:string[]=[];
   if(exportRow.data.export_type==="waitlist"){const q=await admin.schema("launch").from("waitlist_entries").select("email,name,company,job_role,country,source,status,email_verified_at,invited_at,created_at").order("created_at");if(q.error)throw q.error;rows=(q.data??[]) as Record<string,unknown>[];columns=["email","name","company","job_role","country","source","status","email_verified_at","invited_at","created_at"];}
   else if(exportRow.data.export_type==="users"){const q=await admin.schema("app").rpc("superadmin_user_directory",{p_query:null,p_limit:100000,p_offset:0});if(q.error)throw q.error;rows=(q.data??[]) as Record<string,unknown>[];columns=["id","email","display_name","is_superadmin","organization_count","account_created_at","last_sign_in_at","is_suspended"];}
   else if(exportRow.data.export_type==="customers"){const q=await admin.schema("billing").from("billing_customers").select("organization_id,billing_email,tax_country,provider,provider_customer_id,created_at,updated_at").order("created_at");if(q.error)throw q.error;rows=(q.data??[]) as Record<string,unknown>[];columns=["organization_id","billing_email","tax_country","provider","provider_customer_id","created_at","updated_at"];}
   else if(exportRow.data.export_type==="audience"){const q=await admin.schema("marketing").from("audience_members").select("email,name,company,lifecycle_stage,marketing_consent,marketing_consent_at,unsubscribed_at,source,created_at").order("created_at");if(q.error)throw q.error;rows=(q.data??[]) as Record<string,unknown>[];columns=["email","name","company","lifecycle_stage","marketing_consent","marketing_consent_at","unsubscribed_at","source","created_at"];}
   else throw new Error("unsupported_export_type");
   const content=Buffer.from(csv(rows,columns),"utf8");const path=`exports/${exportId}.csv`;const upload=await admin.storage.from("admin-exports").upload(path,content,{contentType:"text/csv",cacheControl:"private, max-age=0",upsert:true});if(upload.error)throw upload.error;
   const finished=await admin.schema("operations").rpc("finish_job",{p_job_id:jobId,p_worker_id:workerId,p_lease_generation:generation,p_success:true,p_error:null});if(finished.error||finished.data!==true)throw new Error("marketing_export_lease_lost");
   const expires=new Date(Date.now()+24*60*60*1000).toISOString();const done=await admin.schema("marketing").from("exports").update({status:"ready",storage_path:path,row_count:rows.length,expires_at:expires,completed_at:new Date().toISOString(),error_code:null}).eq("id",exportId);if(done.error)throw done.error;
   results.push({id:exportId,status:"ready",rows:rows.length,attempt});
  }catch(e){
   const reason=e instanceof Error?e.message.slice(0,120):"export_failed";const failed=await admin.schema("operations").rpc("finish_job",{p_job_id:jobId,p_worker_id:workerId,p_lease_generation:generation,p_success:false,p_error:{code:reason}});const terminal=attempt>=5||failed.error||failed.data!==true;
   await admin.schema("marketing").from("exports").update({status:terminal?"failed":"queued",error_code:reason,completed_at:terminal?new Date().toISOString():null}).eq("id",exportId);
   results.push({id:exportId,status:terminal?"failed":"retry_queued",attempt,reason});
  }
 }
 return NextResponse.json({processed:results.length,results},{headers:{"cache-control":"no-store"}});
}
export async function GET(request:Request){return POST(request);}