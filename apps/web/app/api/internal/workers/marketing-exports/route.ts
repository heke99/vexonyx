import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function authorized(request:Request){const expected=process.env.WORKER_SHARED_SECRET||process.env.CRON_SECRET;const value=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";if(!expected||!value)return false;const a=Buffer.from(value);const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
function csvCell(v:unknown){const s=String(v??"");return `"${s.replaceAll('"','""')}"`;}
function csv(rows:Record<string,unknown>[],columns:string[]){return [columns.map(csvCell).join(","),...rows.map(r=>columns.map(c=>csvCell(r[c])).join(","))].join("\r\n");}

export async function POST(request:Request){
 if(!authorized(request))return NextResponse.json({error:"unauthorized"},{status:401});const admin=createAdminClient();if(!admin)return NextResponse.json({error:"worker_unavailable"},{status:503});
 const {data:jobs}=await admin.schema("marketing").from("exports").select("id,export_type,filters").eq("status","queued").order("created_at").limit(5);const results=[] as Array<Record<string,unknown>>;
 for(const job of jobs??[]){const claim=await admin.schema("marketing").from("exports").update({status:"running"}).eq("id",job.id).eq("status","queued").select("id").maybeSingle();if(!claim.data)continue;try{
  let rows:Record<string,unknown>[]=[];let columns:string[]=[];
  if(job.export_type==="waitlist"){const q=await admin.schema("launch").from("waitlist_entries").select("email,name,company,job_role,country,source,status,email_verified_at,invited_at,created_at").order("created_at");if(q.error)throw q.error;rows=(q.data??[]) as Record<string,unknown>[];columns=["email","name","company","job_role","country","source","status","email_verified_at","invited_at","created_at"];}
  else if(job.export_type==="users"){const q=await admin.schema("app").rpc("superadmin_user_directory",{p_query:null,p_limit:100000,p_offset:0});if(q.error)throw q.error;rows=(q.data??[]) as Record<string,unknown>[];columns=["id","email","display_name","is_superadmin","organization_count","account_created_at","last_sign_in_at","is_suspended"];}
  else if(job.export_type==="customers"){const q=await admin.schema("billing").from("billing_customers").select("organization_id,billing_email,tax_country,provider,provider_customer_id,created_at,updated_at").order("created_at");if(q.error)throw q.error;rows=(q.data??[]) as Record<string,unknown>[];columns=["organization_id","billing_email","tax_country","provider","provider_customer_id","created_at","updated_at"];}
  else{const q=await admin.schema("marketing").from("audience_members").select("email,name,company,lifecycle_stage,marketing_consent,marketing_consent_at,unsubscribed_at,source,created_at").order("created_at");if(q.error)throw q.error;rows=(q.data??[]) as Record<string,unknown>[];columns=["email","name","company","lifecycle_stage","marketing_consent","marketing_consent_at","unsubscribed_at","source","created_at"];}
  const content=Buffer.from(csv(rows,columns),"utf8");const path=`exports/${job.id}.csv`;const upload=await admin.storage.from("admin-exports").upload(path,content,{contentType:"text/csv",cacheControl:"private, max-age=0",upsert:true});if(upload.error)throw upload.error;const expires=new Date(Date.now()+24*60*60*1000).toISOString();await admin.schema("marketing").from("exports").update({status:"ready",storage_path:path,row_count:rows.length,expires_at:expires,completed_at:new Date().toISOString(),error_code:null}).eq("id",job.id);results.push({id:job.id,status:"ready",rows:rows.length});
 }catch(e){await admin.schema("marketing").from("exports").update({status:"failed",error_code:e instanceof Error?e.message.slice(0,120):"export_failed",completed_at:new Date().toISOString()}).eq("id",job.id);results.push({id:job.id,status:"failed"});}}
 return NextResponse.json({processed:results.length,results});
}
export async function GET(request:Request){return POST(request);}
