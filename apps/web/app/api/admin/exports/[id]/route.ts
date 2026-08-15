import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/admin/guard";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const {admin}=await requireSuperadmin();const {data,error}=await admin.schema("marketing").from("exports").select("id,status,storage_path,expires_at").eq("id",id).maybeSingle();
 if(error||!data)return NextResponse.json({error:"not_found"},{status:404});if(data.status!=="ready"||!data.storage_path)return NextResponse.json({error:"not_ready"},{status:409});if(data.expires_at&&new Date(data.expires_at)<new Date())return NextResponse.json({error:"expired"},{status:410});
 const signed=await admin.storage.from("admin-exports").createSignedUrl(data.storage_path,60);if(signed.error||!signed.data?.signedUrl)return NextResponse.json({error:"sign_failed"},{status:500});return NextResponse.redirect(signed.data.signedUrl,302);
}
