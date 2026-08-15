import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const ws=await getWorkspace();if(!ws?.organizationId)return NextResponse.json({error:"unauthorized"},{status:401});
 const job=await ws.supabase.schema("reports").from("render_jobs").select("id,status,output_storage_path,organization_id").eq("id",id).eq("organization_id",ws.organizationId).maybeSingle();if(job.error||!job.data)return NextResponse.json({error:"not_found"},{status:404});if(job.data.status!=="ready"||!job.data.output_storage_path)return NextResponse.json({error:"not_ready"},{status:409});
 const admin=createAdminClient();if(!admin)return NextResponse.json({error:"download_unavailable"},{status:503});const signed=await admin.storage.from("project-artifacts").createSignedUrl(job.data.output_storage_path,60);if(signed.error||!signed.data?.signedUrl)return NextResponse.json({error:"sign_failed"},{status:500});return NextResponse.redirect(signed.data.signedUrl,302);
}
