import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const encoder = new TextEncoder();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const states = [
  ["QUEUED","Request accepted by VEXONYX."],
  ["PLANNING","Preparing the objective and limits."],
  ["CONTEXT_LOADING","Loading relevant project context."],
  ["MODEL_RUNNING","Running the pre-GPU preview."],
  ["VALIDATING","Checking the result and linked sources."],
] as const;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0,max) : "";
}

function approximateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

export async function POST(request:Request) {
  const supabase = await createClient();
  const {data} = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return Response.json({error:"Unauthorized"},{status:401});

  const admin = createAdminClient();
  if (!admin) return Response.json({error:"VEXONYX generation persistence is unavailable"},{status:503});

  let body:{prompt?:unknown;organizationId?:unknown;projectId?:unknown;conversationId?:unknown};
  try { body = await request.json() as typeof body; }
  catch { return Response.json({error:"Invalid request"},{status:400}); }

  const prompt = clean(body.prompt,4000);
  const organizationId = clean(body.organizationId,36);
  const requestedProjectId = clean(body.projectId,36);
  const requestedConversationId = clean(body.conversationId,36);
  const idempotencyKey = clean(request.headers.get("idempotency-key"),160) || crypto.randomUUID();
  if (!prompt || !uuidPattern.test(organizationId)) return Response.json({error:"Invalid request"},{status:400});
  if (requestedProjectId && !uuidPattern.test(requestedProjectId)) return Response.json({error:"Invalid project"},{status:400});
  if (requestedConversationId && !uuidPattern.test(requestedConversationId)) return Response.json({error:"Invalid conversation"},{status:400});

  const {data:membership} = await supabase.schema("app").from("organization_members").select("role").eq("organization_id",organizationId).eq("user_id",userId).maybeSingle();
  if (!membership || membership.role === "viewer") return Response.json({error:"Workspace write access required"},{status:403});

  let conversationId = requestedConversationId;
  let projectId:string|null = requestedProjectId || null;
  if (conversationId) {
    const {data:conversation} = await supabase.schema("app").from("conversations").select("id,project_id,user_id,status").eq("id",conversationId).eq("organization_id",organizationId).eq("user_id",userId).maybeSingle();
    if (!conversation || conversation.status === "deleted") return Response.json({error:"Conversation not found"},{status:404});
    projectId = conversation.project_id ?? null;
  } else {
    if (projectId) {
      const {data:project} = await supabase.schema("app").from("projects").select("id").eq("id",projectId).eq("organization_id",organizationId).is("deleted_at",null).maybeSingle();
      if (!project) return Response.json({error:"Project not found"},{status:404});
    }
    const title = prompt.replace(/\s+/g," ").slice(0,72) || "New chat";
    const {data:created,error} = await supabase.schema("app").from("conversations").insert({organization_id:organizationId,project_id:projectId,user_id:userId,title,status:"active"}).select("id").single();
    if (error || !created?.id) return Response.json({error:"Unable to create conversation"},{status:500});
    conversationId = created.id;
  }

  const messageKey = `${idempotencyKey}:user`;
  let {data:userMessage} = await supabase.schema("app").from("messages").select("id").eq("conversation_id",conversationId).eq("idempotency_key",messageKey).maybeSingle();
  if (!userMessage) {
    const inserted = await supabase.schema("app").from("messages").insert({organization_id:organizationId,conversation_id:conversationId,user_id:userId,role:"user",content:{kind:"text",text:prompt},idempotency_key:messageKey}).select("id").single();
    if (inserted.error || !inserted.data?.id) return Response.json({error:"Unable to save message"},{status:500});
    userMessage = inserted.data;
  }

  const existingRequest = await admin.schema("ai").from("generation_requests").select("id,status").eq("organization_id",organizationId).eq("idempotency_key",idempotencyKey).maybeSingle();
  let generationRequestId = existingRequest.data?.id as string|undefined;
  let attemptId:string|undefined;
  const startedAt = Date.now();
  const inputTokens = approximateTokens(prompt);
  const assistantText = "Pre-GPU preview completed. Your conversation and generation state were saved. Private model inference is not connected yet.";
  const outputTokens = approximateTokens(assistantText);

  if (!generationRequestId) {
    const requestInsert = await admin.schema("ai").from("generation_requests").insert({
      organization_id:organizationId,
      user_id:userId,
      project_id:projectId,
      conversation_id:conversationId,
      requested_role:"general",
      task_type:"general_chat",
      chosen_model_alias:"vexonyx-general",
      fallback_model_alias:"vexonyx-small",
      escalation_model_alias:"vexonyx-reasoning",
      routing_reason:"pre_gpu_general_chat",
      routing_version:1,
      status:"running",
      priority:1,
      input_tokens:inputTokens,
      output_tokens:0,
      cost:0,
      idempotency_key:idempotencyKey,
    }).select("id").single();
    if (requestInsert.error || !requestInsert.data?.id) return Response.json({error:"Unable to persist generation"},{status:500});
    generationRequestId = requestInsert.data.id;

    const attemptInsert = await admin.schema("ai").from("generation_attempts").insert({
      organization_id:organizationId,
      generation_request_id:generationRequestId,
      attempt_number:1,
      status:"running",
      input_tokens:inputTokens,
      output_tokens:0,
      cost:0,
      started_at:new Date().toISOString(),
      metadata:{mode:"pre_gpu_mock",model_alias:"vexonyx-general"},
    }).select("id").single();
    if (!attemptInsert.error && attemptInsert.data?.id) attemptId = attemptInsert.data.id;
  }

  const finalConversationId = conversationId;
  const finalProjectId = projectId;
  const finalGenerationRequestId = generationRequestId;
  const finalAttemptId = attemptId;
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(JSON.stringify({type:"meta",conversationId:finalConversationId,generationRequestId:finalGenerationRequestId}) + "\n"));
        for (const [state,message] of states) {
          controller.enqueue(encoder.encode(JSON.stringify({type:"state",state,message}) + "\n"));
          await new Promise((resolve) => setTimeout(resolve,180));
        }

        const completedAt = new Date().toISOString();
        const generationMs = Date.now() - startedAt;
        const assistantKey = `${idempotencyKey}:assistant`;
        const existingAssistant = await admin.schema("app").from("messages").select("id").eq("conversation_id",finalConversationId).eq("idempotency_key",assistantKey).maybeSingle();
        if (!existingAssistant.data) {
          await admin.schema("app").from("messages").insert({organization_id:organizationId,conversation_id:finalConversationId,user_id:null,role:"assistant",parent_message_id:userMessage.id,content:{kind:"text",text:assistantText,preview:true,generationRequestId:finalGenerationRequestId},idempotency_key:assistantKey});
        }
        await admin.schema("app").from("conversations").update({updated_at:completedAt}).eq("id",finalConversationId).eq("organization_id",organizationId);
        await admin.schema("ai").from("generation_requests").update({status:"completed",output_tokens:outputTokens,generation_ms:generationMs,completed_at:completedAt}).eq("id",finalGenerationRequestId).eq("organization_id",organizationId);
        if (finalAttemptId) await admin.schema("ai").from("generation_attempts").update({status:"succeeded",output_tokens:outputTokens,generation_ms:generationMs,completed_at:completedAt}).eq("id",finalAttemptId).eq("organization_id",organizationId);
        await admin.schema("usage").from("usage_events").insert({organization_id:organizationId,user_id:userId,project_id:finalProjectId,event_type:"generations",quantity:1,unit:"generation",cost:0,metadata:{generation_request_id:finalGenerationRequestId,model_alias:"vexonyx-general",mode:"pre_gpu_mock"}});

        controller.enqueue(encoder.encode(JSON.stringify({type:"message",role:"assistant",message:assistantText}) + "\n"));
        controller.enqueue(encoder.encode(JSON.stringify({type:"state",state:"COMPLETED",message:"Preview completed and saved."}) + "\n"));
      } catch {
        await admin.schema("ai").from("generation_requests").update({status:"failed",completed_at:new Date().toISOString()}).eq("id",finalGenerationRequestId).eq("organization_id",organizationId);
        if (finalAttemptId) await admin.schema("ai").from("generation_attempts").update({status:"failed",error_code:"mock_persistence_failure",error_message:"Generation completion persistence failed",completed_at:new Date().toISOString()}).eq("id",finalAttemptId).eq("organization_id",organizationId);
        controller.enqueue(encoder.encode(JSON.stringify({type:"state",state:"FAILED",message:"VEXONYX could not persist the preview result."}) + "\n"));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream,{headers:{"content-type":"application/x-ndjson; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","x-vexonyx-conversation-id":conversationId}});
}
