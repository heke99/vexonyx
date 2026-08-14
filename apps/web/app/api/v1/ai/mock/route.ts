import { createClient } from "@/lib/supabase/server";

const encoder=new TextEncoder();
const states=[
  ["QUEUED","Request accepted by the VEXONYX API."],["PLANNING","Objective classified and budget initialized."],["CONTEXT_LOADING","Tenant-bound project context selected."],["MODEL_RUNNING","Mock provider is simulating generation."],["VALIDATING","Output contract and provenance checked."],["COMPLETED","Mock run completed without external execution."],
] as const;
export async function POST(request:Request){const supabase=await createClient();const {data}=await supabase.auth.getClaims();if(!data?.claims?.sub)return Response.json({error:"Unauthorized"},{status:401});let body:{prompt?:unknown};try{body=await request.json() as {prompt?:unknown}}catch{return Response.json({error:"Invalid request"},{status:400})}if(typeof body.prompt!=="string"||!body.prompt.trim()||body.prompt.length>1000)return Response.json({error:"Invalid prompt"},{status:400});const stream=new ReadableStream({async start(controller){for(const [state,message] of states){controller.enqueue(encoder.encode(JSON.stringify({state,message})+"\n"));await new Promise(resolve=>setTimeout(resolve,220))}controller.close()}});return new Response(stream,{headers:{"content-type":"application/x-ndjson; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}})}
