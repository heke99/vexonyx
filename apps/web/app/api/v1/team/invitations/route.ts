import { createEmailProvider } from "@/lib/email/provider";
import { createClient } from "@/lib/supabase/server";

const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roles=new Set(["organization_admin","member","viewer"]);
const clean=(value:unknown,max:number)=>typeof value==="string"?value.trim().slice(0,max):"";

export async function POST(request:Request){
  const supabase=await createClient();const {data}=await supabase.auth.getClaims();if(!data?.claims?.sub)return Response.json({error:"Unauthorized"},{status:401});
  let body:{organizationId?:unknown;email?:unknown;role?:unknown};try{body=await request.json() as typeof body;}catch{return Response.json({error:"Invalid request"},{status:400});}
  const organizationId=clean(body.organizationId,36);const email=clean(body.email,320).toLowerCase();const role=clean(body.role,40);
  if(!uuidPattern.test(organizationId)||!emailPattern.test(email)||!roles.has(role))return Response.json({error:"Invalid invitation"},{status:400});
  const {data:organization}=await supabase.schema("app").from("organizations").select("name").eq("id",organizationId).maybeSingle();if(!organization)return Response.json({error:"Organization not found"},{status:404});
  const {data:invite,error}=await supabase.schema("app").rpc("create_organization_invitation",{p_organization_id:organizationId,p_email:email,p_role:role});
  if(error)return Response.json({error:error.message.includes("already_member")?"This person is already a member.":"Unable to create invitation"},{status:403});
  const row=Array.isArray(invite)?invite[0]:invite;if(!row?.invitation_id||!row?.raw_token)return Response.json({error:"Unable to create invitation"},{status:500});
  const invitationUrl=new URL(`/invite/${row.invitation_id}`,request.url);invitationUrl.searchParams.set("token",String(row.raw_token));
  const delivery=await createEmailProvider().sendOrganizationInvitation({to:email,organizationName:organization.name,role,invitationUrl:invitationUrl.toString()});
  return Response.json({ok:true,invitationId:row.invitation_id,expiresAt:row.expires_at,delivery:delivery.sent?"sent":delivery.reason,invitationUrl:delivery.sent?undefined:invitationUrl.toString()},{status:delivery.sent?201:202,headers:{"cache-control":"no-store"}});
}
