import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const encoder = new TextEncoder();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const modelModes = new Set(["auto","fast","pro","deep","specific"]);
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

function routeForMode(mode:string,specificAlias:string|null) {
  if (mode === "specific" && specificAlias) return {chosen:specificAlias,fallback:null,escalation:null,reason:"pre_gpu_specific_model"};
  if (mode === "fast") return {chosen:"vexonyx-small",fallback:"vexonyx-general",escalation:"vexonyx-reasoning",reason:"pre_gpu_fast"};
  if (mode === "pro") return {chosen:"vexonyx-security",fallback:"vexonyx-general",escalation:"vexonyx-reasoning",reason:"pre_gpu_pro"};
  if (mode === "deep") return {chosen:"vexonyx-reasoning",fallback:"vexonyx-security",escalation:null,reason:"pre_gpu_deep"};
  return {chosen:"vexonyx-general",fallback:"vexonyx-small",escalation:"vexonyx-reasoning",reason:"pre_gpu_auto"};
}

export async function POST(request:Request) {
  const supabase = await createClient();
  const {data} = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return Response.json({error:"Unauthorized"},{status:401});

  const admin = createAdminClient();
  if (!admin) return Response.json({error:"VEXONYX generation persistence is unavailable"},{status:503});

  let body:{prompt?:unknown;organizationId?:unknown;projectId?:unknown;conversationId?:unknown;agentProfileId?:unknown;modelSelectionMode?:unknown;selectedModelAlias?:unknown};
  try { body = await request.json() as typeof body; }
  catch { return Response.json({error:"Invalid request"},{status:400}); }

  const prompt = clean(body.prompt,4000);
  const organizationId = clean(body.organizationId,36);
  const requestedProjectId = clean(body.projectId,36);
  const requestedConversationId = clean(body.conversationId,36);
  const requestedAgentProfileId = clean(body.agentProfileId,36);
  const requestedModelMode = clean(body.modelSelectionMode,20);
  const requestedModelAlias = clean(body.selectedModelAlias,120);
  const agentFieldProvided = Object.prototype.hasOwnProperty.call(body,"agentProfileId");
  const idempotencyKey = clean(request.headers.get("idempotency-key"),160) || crypto.randomUUID();
  if (!prompt || !uuidPattern.test(organizationId)) return Response.json({error:"Invalid request"},{status:400});
  if (requestedProjectId && !uuidPattern.test(requestedProjectId)) return Response.json({error:"Invalid project"},{status:400});
  if (requestedConversationId && !uuidPattern.test(requestedConversationId)) return Response.json({error:"Invalid conversation"},{status:400});
  if (requestedAgentProfileId && !uuidPattern.test(requestedAgentProfileId)) return Response.json({error:"Invalid agent profile"},{status:400});
  if (requestedModelMode && !modelModes.has(requestedModelMode)) return Response.json({error:"Invalid model mode"},{status:400});

  const {data:membership} = await supabase.schema("app").from("organization_members").select("role").eq("organization_id",organizationId).eq("user_id",userId).maybeSingle();
  if (!membership || membership.role === "viewer") return Response.json({error:"Workspace write access required"},{status:403});

  let conversationId = requestedConversationId;
  let projectId:string|null = requestedProjectId || null;
  let agentProfileId:string|null = null;
  let agentProfileVersionId:string|null = null;
  let modelSelectionMode = requestedModelMode || "auto";
  let selectedModelAlias:string|null = requestedModelAlias || null;

  if (conversationId) {
    const {data:conversation} = await supabase.schema("app").from("conversations").select("id,project_id,user_id,status,agent_profile_id,agent_profile_version_id,model_selection_mode,selected_model_alias").eq("id",conversationId).eq("organization_id",organizationId).eq("user_id",userId).maybeSingle();
    if (!conversation || conversation.status === "deleted") return Response.json({error:"Conversation not found"},{status:404});
    projectId = conversation.project_id ?? null;
    agentProfileId = agentFieldProvided ? (requestedAgentProfileId || null) : (conversation.agent_profile_id ?? null);
    agentProfileVersionId = agentFieldProvided ? null : (conversation.agent_profile_version_id ?? null);
    modelSelectionMode = requestedModelMode || conversation.model_selection_mode || "auto";
    selectedModelAlias = modelSelectionMode === "specific" ? (requestedModelAlias || conversation.selected_model_alias || null) : null;
  } else {
    agentProfileId = requestedAgentProfileId || null;
    if (projectId) {
      const {data:project} = await supabase.schema("app").from("projects").select("id").eq("id",projectId).eq("organization_id",organizationId).is("deleted_at",null).maybeSingle();
      if (!project) return Response.json({error:"Project not found"},{status:404});
    }
  }

  if (!modelModes.has(modelSelectionMode)) return Response.json({error:"Invalid model mode"},{status:400});
  if (modelSelectionMode === "specific" && !selectedModelAlias) return Response.json({error:"Specific model selection requires a model"},{status:400});
  if (modelSelectionMode !== "specific") selectedModelAlias = null;

  if (agentProfileId) {
    const {data:profile,error:profileError} = await supabase.schema("ai").from("agent_profiles").select("id,current_version,enabled").eq("id",agentProfileId).eq("enabled",true).maybeSingle();
    if (profileError || !profile) return Response.json({error:"Agent profile is unavailable"},{status:403});
    const {data:version,error:versionError} = await supabase.schema("ai").from("agent_profile_versions").select("id,status").eq("agent_profile_id",profile.id).eq("version",profile.current_version).maybeSingle();
    if (versionError || !version || version.status === "retired") return Response.json({error:"Agent profile version is unavailable"},{status:403});
    agentProfileVersionId = version.id;
  } else {
    agentProfileVersionId = null;
  }

  if (selectedModelAlias) {
    const {data:availableModels,error:modelError} = await supabase.schema("ai").rpc("available_models_for_user",{p_organization_id:organizationId});
    if (modelError) return Response.json({error:"Unable to verify model access"},{status:503});
    if (!(availableModels ?? []).some((model:{alias:string})=>model.alias===selectedModelAlias)) return Response.json({error:"Model is not available for this organization"},{status:403});
  }

  if (!conversationId) {
    const title = prompt.replace(/\s+/g," ").slice(0,72) || "New chat";
    const {data:created,error} = await supabase.schema("app").from("conversations").insert({
      organization_id:organizationId,
      project_id:projectId,
      user_id:userId,
      title,
      status:"active",
      agent_profile_id:agentProfileId,
      agent_profile_version_id:agentProfileVersionId,
      model_selection_mode:modelSelectionMode,
      selected_model_alias:selectedModelAlias,
    }).select("id").single();
    if (error || !created?.id) return Response.json({error:"Unable to create conversation"},{status:500});
    conversationId = created.id;
  } else {
    const {error:updateError} = await supabase.schema("app").from("conversations").update({
      agent_profile_id:agentProfileId,
      agent_profile_version_id:agentProfileVersionId,
      model_selection_mode:modelSelectionMode,
      selected_model_alias:selectedModelAlias,
      updated_at:new Date().toISOString(),
    }).eq("id",conversationId).eq("organization_id",organizationId).eq("user_id",userId);
    if (updateError) return Response.json({error:"Unable to save conversation settings"},{status:500});
  }

  const {error:preferenceError} = await supabase.schema("app").from("user_model_preferences").upsert({
    organization_id:organizationId,
    user_id:userId,
    model_selection_mode:modelSelectionMode,
    model_alias:selectedModelAlias,
    updated_at:new Date().toISOString(),
  },{onConflict:"organization_id,user_id"});
  if (preferenceError) return Response.json({error:"Unable to save model preference"},{status:500});

  const messageKey = `${idempotencyKey}:user`;
  let {data:userMessage} = await supabase.schema("app").from("messages").select("id").eq("conversation_id",conversationId).eq("idempotency_key",messageKey).maybeSingle();
  if (!userMessage) {
    const inserted = await supabase.schema("app").from("messages").insert({organization_id:organizationId,conversation_id:conversationId,user_id:userId,role:"user",content:{kind:"text",text:prompt},idempotency_key:messageKey}).select("id").single();
    if (inserted.error || !inserted.data?.id) return Response.json({error:"Unable to save message"},{status:500});
    userMessage = inserted.data;
  }

  const route = routeForMode(modelSelectionMode,selectedModelAlias);
  const policySnapshot = {phase:"pre_gpu",platform_enforcement:"active",external_execution:false};
  const existingRequest = await admin.schema("ai").from("generation_requests").select("id,status").eq("organization_id",organizationId).eq("idempotency_key",idempotencyKey).maybeSingle();
  let generationRequestId = existingRequest.data?.id as string|undefined;
  let attemptId:string|undefined;
  const startedAt = Date.now();
  const inputTokens = approximateTokens(prompt);
  const modelModeLabel = modelSelectionMode.charAt(0).toUpperCase() + modelSelectionMode.slice(1);
  const assistantText = `Pre-GPU preview completed using ${modelSelectionMode === "specific" ? route.chosen : `VEXONYX ${modelModeLabel}`} routing. Your conversation, agent profile and generation state were saved. Private model inference is not connected yet.`;
  const outputTokens = approximateTokens(assistantText);

  if (!generationRequestId) {
    const requestInsert = await admin.schema("ai").from("generation_requests").insert({
      organization_id:organizationId,
      user_id:userId,
      project_id:projectId,
      conversation_id:conversationId,
      requested_role:"general",
      task_type:"general_chat",
      model_selection_mode:modelSelectionMode,
      requested_model_alias:selectedModelAlias,
      agent_profile_version_id:agentProfileVersionId,
      policy_snapshot:policySnapshot,
      chosen_model_alias:route.chosen,
      fallback_model_alias:route.fallback,
      escalation_model_alias:route.escalation,
      routing_reason:route.reason,
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
      metadata:{mode:"pre_gpu_mock",model_selection_mode:modelSelectionMode,model_alias:route.chosen,agent_profile_id:agentProfileId,agent_profile_version_id:agentProfileVersionId},
    }).select("id").single();
    if (!attemptInsert.error && attemptInsert.data?.id) attemptId = attemptInsert.data.id;
  }

  const finalConversationId = conversationId;
  const finalProjectId = projectId;
  const finalGenerationRequestId = generationRequestId;
  const finalAttemptId = attemptId;
  const finalRoute = route;
  const finalAgentProfileId = agentProfileId;
  const finalAgentProfileVersionId = agentProfileVersionId;
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
          await admin.schema("app").from("messages").insert({organization_id:organizationId,conversation_id:finalConversationId,user_id:null,role:"assistant",parent_message_id:userMessage.id,content:{kind:"text",text:assistantText,preview:true,generationRequestId:finalGenerationRequestId,modelSelectionMode,modelAlias:finalRoute.chosen,agentProfileId:finalAgentProfileId},idempotency_key:assistantKey});
        }
        await admin.schema("app").from("conversations").update({updated_at:completedAt}).eq("id",finalConversationId).eq("organization_id",organizationId);
        await admin.schema("ai").from("generation_requests").update({status:"completed",output_tokens:outputTokens,generation_ms:generationMs,completed_at:completedAt}).eq("id",finalGenerationRequestId).eq("organization_id",organizationId);
        if (finalAttemptId) await admin.schema("ai").from("generation_attempts").update({status:"succeeded",output_tokens:outputTokens,generation_ms:generationMs,completed_at:completedAt}).eq("id",finalAttemptId).eq("organization_id",organizationId);
        await admin.schema("usage").from("usage_events").insert({organization_id:organizationId,user_id:userId,project_id:finalProjectId,event_type:"generations",quantity:1,unit:"generation",cost:0,metadata:{generation_request_id:finalGenerationRequestId,model_selection_mode:modelSelectionMode,model_alias:finalRoute.chosen,agent_profile_id:finalAgentProfileId,agent_profile_version_id:finalAgentProfileVersionId,mode:"pre_gpu_mock"}});

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
