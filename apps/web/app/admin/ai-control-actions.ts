"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/admin/guard";

const policyActions = new Set(["allow","deny","sandbox_only","allow_scoped","require_approval","limit"]);
const scopeTypes = new Set(["global","plan","organization","workspace","agent","run"]);
const profileNetworks = new Set(["none","internet","scope_only","allowlist","custom"]);
const profileAutonomy = new Set(["low","medium","high"]);

function text(value: FormDataEntryValue | null, max = 500) {
  return String(value ?? "").trim().slice(0,max);
}

function keyify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,96);
}

async function audit(
  admin: Awaited<ReturnType<typeof requireSuperadmin>>["admin"],
  userId: string,
  action: string,
  resourceType: string,
  resourceId?: string | null,
  metadata?: Record<string, unknown>,
) {
  const { error } = await admin.schema("audit").from("audit_logs").insert({
    actor_user_id:userId,
    actor_type:"superadmin",
    action,
    resource_type:resourceType,
    resource_id:resourceId || null,
    metadata:metadata ?? {},
  });
  if (error) throw error;
}

export async function setPolicyEnabled(formData: FormData) {
  const { admin,userId } = await requireSuperadmin();
  const policySetId = text(formData.get("policy_set_id"),36);
  const enabled = text(formData.get("enabled"),5) === "true";
  if (!policySetId) throw new Error("Missing policy");
  const { data:before,error:readError } = await admin.schema("policies").from("policy_sets").select("id,key,name,enabled,locked").eq("id",policySetId).maybeSingle();
  if (readError || !before) throw readError ?? new Error("Policy not found");
  if (before.locked) throw new Error("Platform enforcement policies cannot be disabled from the UI");
  const { error } = await admin.schema("policies").from("policy_sets").update({enabled,updated_at:new Date().toISOString()}).eq("id",policySetId).eq("locked",false);
  if (error) throw error;
  await admin.schema("policies").from("policy_change_logs").insert({policy_set_id:policySetId,actor_user_id:userId,action:"policy.enabled_changed",before_state:{enabled:before.enabled},after_state:{enabled}});
  await audit(admin,userId,"ai.policy.enabled_changed","policy_set",policySetId,{key:before.key,from:before.enabled,to:enabled});
  revalidatePath("/admin/policies");
  revalidatePath("/admin/ai");
}

export async function createPolicy(formData: FormData) {
  const { admin,userId } = await requireSuperadmin();
  const name = text(formData.get("name"),160);
  const requestedKey = keyify(text(formData.get("key"),96) || name);
  const description = text(formData.get("description"),1000);
  const layer = text(formData.get("layer"),30) || "global";
  const assignmentScope = text(formData.get("scope_type"),30) || "global";
  const assignmentScopeId = text(formData.get("scope_id"),180);
  if (name.length < 2 || requestedKey.length < 3) throw new Error("Policy name and key are required");
  if (!["global","plan","organization","workspace","agent","run"].includes(layer)) throw new Error("Platform policies are migration-controlled");
  if (!scopeTypes.has(assignmentScope)) throw new Error("Invalid assignment scope");
  if (assignmentScope !== "global" && !assignmentScopeId) throw new Error("This assignment scope requires an ID");

  const selections = [
    ["tool","network-scan",text(formData.get("network_scan"),30) || "allow_scoped","high"],
    ["tool","browser",text(formData.get("browser"),30) || "allow_scoped","medium"],
    ["tool","shell",text(formData.get("shell"),30) || "sandbox_only","high"],
    ["tool","file-execution",text(formData.get("file_execution"),30) || "sandbox_only","high"],
    ["content.image","adult_nudity",text(formData.get("image_nudity"),30) || "deny","high"],
  ] as const;
  if (selections.some(([, ,action]) => !policyActions.has(action))) throw new Error("Invalid policy action");

  const { data:policySet,error:setError } = await admin.schema("policies").from("policy_sets").insert({
    key:requestedKey,name,description:description || null,layer,locked:false,enabled:true,current_version:1,created_by:userId,
  }).select("id").single();
  if (setError || !policySet?.id) throw setError ?? new Error("Unable to create policy");

  try {
    const { data:version,error:versionError } = await admin.schema("policies").from("policy_versions").insert({
      policy_set_id:policySet.id,version:1,status:"active",change_reason:"Created in Superadmin Policy Center",created_by:userId,activated_at:new Date().toISOString(),
    }).select("id").single();
    if (versionError || !version?.id) throw versionError ?? new Error("Unable to create policy version");

    const { error:rulesError } = await admin.schema("policies").from("policy_rules").insert(selections.map(([category,resource,action,severity],index) => ({
      policy_version_id:version.id,
      category,
      resource,
      action,
      severity,
      priority:500-index,
      non_overridable:false,
      config:action === "sandbox_only" && ["shell","file-execution"].includes(resource) ? {requires_approval:true} : {},
    })));
    if (rulesError) throw rulesError;

    const { error:assignmentError } = await admin.schema("policies").from("policy_assignments").insert({
      policy_version_id:version.id,
      scope_type:assignmentScope,
      scope_id:assignmentScope === "global" ? null : assignmentScopeId,
      priority:100,
      enabled:true,
      assigned_by:userId,
    });
    if (assignmentError) throw assignmentError;

    await admin.schema("policies").from("policy_change_logs").insert({
      policy_set_id:policySet.id,policy_version_id:version.id,actor_user_id:userId,action:"policy.created",after_state:{name,key:requestedKey,layer,scope_type:assignmentScope,scope_id:assignmentScope === "global" ? null : assignmentScopeId},
    });
    await audit(admin,userId,"ai.policy.created","policy_set",policySet.id,{key:requestedKey,layer,scope_type:assignmentScope});
  } catch (error) {
    await admin.schema("policies").from("policy_sets").delete().eq("id",policySet.id).eq("locked",false);
    throw error;
  }

  revalidatePath("/admin/policies");
  revalidatePath("/admin/ai");
}

export async function assignPolicyVersion(formData: FormData) {
  const { admin,userId } = await requireSuperadmin();
  const policyVersionId = text(formData.get("policy_version_id"),36);
  const scopeType = text(formData.get("scope_type"),30);
  const scopeId = text(formData.get("scope_id"),180);
  if (!policyVersionId || !scopeTypes.has(scopeType)) throw new Error("Invalid policy assignment");
  if (scopeType !== "global" && !scopeId) throw new Error("This scope requires an ID");
  const normalizedScopeId = scopeType === "global" ? null : scopeId;
  let existingQuery = admin.schema("policies").from("policy_assignments").select("id,enabled").eq("policy_version_id",policyVersionId).eq("scope_type",scopeType);
  existingQuery = normalizedScopeId === null ? existingQuery.is("scope_id",null) : existingQuery.eq("scope_id",normalizedScopeId);
  const { data:existing,error:readError } = await existingQuery.maybeSingle();
  if (readError) throw readError;
  if (existing) {
    const { error } = await admin.schema("policies").from("policy_assignments").update({enabled:true,assigned_by:userId,updated_at:new Date().toISOString()}).eq("id",existing.id);
    if (error) throw error;
  } else {
    const { error } = await admin.schema("policies").from("policy_assignments").insert({policy_version_id:policyVersionId,scope_type:scopeType,scope_id:normalizedScopeId,enabled:true,assigned_by:userId});
    if (error) throw error;
  }
  await audit(admin,userId,"ai.policy.assigned","policy_version",policyVersionId,{scope_type:scopeType,scope_id:normalizedScopeId});
  revalidatePath("/admin/policies");
}

export async function createAgentProfile(formData: FormData) {
  const { admin,userId } = await requireSuperadmin();
  const name = text(formData.get("name"),120);
  const slug = keyify(text(formData.get("slug"),63) || name).replaceAll(".","-").replaceAll("_","-");
  const description = text(formData.get("description"),1000);
  const category = text(formData.get("category"),80) || "security";
  const maxAutonomy = text(formData.get("max_autonomy"),20) || "medium";
  const networkAccess = text(formData.get("network_access"),20) || "scope_only";
  const modelAlias = text(formData.get("model_alias"),120) || "vexonyx-general";
  if (name.length < 2 || slug.length < 2 || !profileAutonomy.has(maxAutonomy) || !profileNetworks.has(networkAccess)) throw new Error("Invalid agent profile");

  const { data:model } = await admin.schema("ai").from("models").select("alias").eq("alias",modelAlias).maybeSingle();
  if (!model) throw new Error("Unknown model alias");
  const { data:profile,error:profileError } = await admin.schema("ai").from("agent_profiles").insert({
    organization_id:null,slug,name,description:description || null,category,enabled:true,current_version:1,created_by:userId,
  }).select("id").single();
  if (profileError || !profile?.id) throw profileError ?? new Error("Unable to create agent profile");

  try {
    const { data:version,error:versionError } = await admin.schema("ai").from("agent_profile_versions").insert({
      agent_profile_id:profile.id,version:1,status:"internal",system_instructions:"Operate through VEXONYX policy, authorization, scope, tool and sandbox boundaries.",max_autonomy:maxAutonomy,network_access:networkAccess,created_by:userId,memory_config:{write_mode:"candidate_only"},
    }).select("id").single();
    if (versionError || !version?.id) throw versionError ?? new Error("Unable to create profile version");
    const { error:modelError } = await admin.schema("ai").from("agent_model_preferences").insert({agent_profile_version_id:version.id,model_alias:modelAlias,purpose:"primary",preference_order:10,enabled:true});
    if (modelError) throw modelError;
    await audit(admin,userId,"ai.agent_profile.created","agent_profile",profile.id,{slug,category,max_autonomy:maxAutonomy,network_access:networkAccess,model_alias:modelAlias});
  } catch (error) {
    await admin.schema("ai").from("agent_profiles").delete().eq("id",profile.id);
    throw error;
  }
  revalidatePath("/admin/agent-profiles");
  revalidatePath("/admin/ai");
}

export async function setAgentProfileEnabled(formData: FormData) {
  const { admin,userId } = await requireSuperadmin();
  const profileId = text(formData.get("profile_id"),36);
  const enabled = text(formData.get("enabled"),5) === "true";
  if (!profileId) throw new Error("Missing agent profile");
  const { data:before,error:readError } = await admin.schema("ai").from("agent_profiles").select("id,slug,enabled").eq("id",profileId).maybeSingle();
  if (readError || !before) throw readError ?? new Error("Agent profile not found");
  const { error } = await admin.schema("ai").from("agent_profiles").update({enabled,updated_at:new Date().toISOString()}).eq("id",profileId);
  if (error) throw error;
  await audit(admin,userId,"ai.agent_profile.enabled_changed","agent_profile",profileId,{slug:before.slug,from:before.enabled,to:enabled});
  revalidatePath("/admin/agent-profiles");
  revalidatePath("/admin/ai");
}

export async function setToolEnabled(formData: FormData) {
  const { admin,userId } = await requireSuperadmin();
  const toolId = text(formData.get("tool_id"),36);
  const enabled = text(formData.get("enabled"),5) === "true";
  if (!toolId) throw new Error("Missing tool");
  const { data:before,error:readError } = await admin.schema("ai").from("tool_definitions").select("id,name,version,enabled,execution_environment").eq("id",toolId).maybeSingle();
  if (readError || !before) throw readError ?? new Error("Tool not found");
  if (enabled && before.execution_environment !== "sandbox") throw new Error("External tools must be sandbox-bound before enablement");
  const { error } = await admin.schema("ai").from("tool_definitions").update({enabled}).eq("id",toolId);
  if (error) throw error;
  await audit(admin,userId,"ai.tool.enabled_changed","tool_definition",toolId,{name:before.name,version:before.version,from:before.enabled,to:enabled});
  revalidatePath("/admin/tools");
  revalidatePath("/admin/ai");
}

export async function setModelEnabled(formData: FormData) {
  const { admin,userId } = await requireSuperadmin();
  const modelId = text(formData.get("model_id"),36);
  const enabled = text(formData.get("enabled"),5) === "true";
  if (!modelId) throw new Error("Missing model");
  const { data:before,error:readError } = await admin.schema("ai").from("models").select("id,alias,enabled").eq("id",modelId).maybeSingle();
  if (readError || !before) throw readError ?? new Error("Model not found");
  if (enabled) {
    const { data:versions } = await admin.schema("ai").from("model_versions").select("id,status").eq("model_id",modelId).in("status",["validated","production","active"]);
    const versionIds = (versions ?? []).map((item:{id:string}) => item.id);
    if (!versionIds.length) throw new Error("A validated model version is required before enablement");
    const { data:deployments } = await admin.schema("ai").from("model_deployments").select("id,status").in("model_version_id",versionIds).in("status",["healthy","ready","active"]);
    if (!deployments?.length) throw new Error("A healthy deployment is required before enablement");
  }
  const { error } = await admin.schema("ai").from("models").update({enabled,updated_at:new Date().toISOString()}).eq("id",modelId);
  if (error) throw error;
  await audit(admin,userId,"ai.model.enabled_changed","model",modelId,{alias:before.alias,from:before.enabled,to:enabled});
  revalidatePath("/admin/models");
  revalidatePath("/admin/ai");
}
