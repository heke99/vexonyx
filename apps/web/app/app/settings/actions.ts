"use server";

import { revalidatePath } from "next/cache";
import { getWorkspace } from "@/lib/workspace";

function text(value:FormDataEntryValue|null,max:number){return String(value??"").trim().slice(0,max);}
function budget(value:FormDataEntryValue|null){const raw=String(value??"").trim();if(!raw)return null;const number=Number(raw);if(!Number.isFinite(number)||number<0||number>100000000)throw new Error("Invalid budget");return number;}
function refresh(){revalidatePath("/app");revalidatePath("/app/settings");}

export async function updatePersonalSettings(formData:FormData){
 const ws=await getWorkspace();if(!ws)throw new Error("Unauthorized");const displayName=text(formData.get("display_name"),120);const timezone=text(formData.get("timezone"),80)||"UTC";if(!displayName)throw new Error("Display name is required");
 const {error}=await ws.supabase.schema("app").from("profiles").update({display_name:displayName,timezone,updated_at:new Date().toISOString()}).eq("id",ws.userId);if(error)throw new Error("Unable to save profile settings");refresh();
}

export async function updateOrganizationSettings(formData:FormData){
 const ws=await getWorkspace();if(!ws?.organizationId||!["organization_owner","organization_admin"].includes(String(ws.role)))throw new Error("Organization admin required");const name=text(formData.get("name"),120);if(name.length<2)throw new Error("Organization name is required");
 const {error}=await ws.supabase.schema("app").from("organizations").update({name,updated_at:new Date().toISOString()}).eq("id",ws.organizationId);if(error)throw new Error("Unable to save organization settings");refresh();
}

export async function updateSafetyBudgets(formData:FormData){
 const ws=await getWorkspace();if(!ws?.organizationId||!["organization_owner","organization_admin"].includes(String(ws.role)))throw new Error("Organization admin required");
 const {error}=await ws.supabase.schema("billing").rpc("update_organization_quotas",{p_organization_id:ws.organizationId,p_monthly_budget:budget(formData.get("monthly_budget")),p_agent_budget:budget(formData.get("agent_budget")),p_generation_budget:budget(formData.get("generation_budget")),p_sandbox_budget:budget(formData.get("sandbox_budget")),p_hard_cap_enabled:String(formData.get("hard_cap_enabled")??"")==="true"});if(error)throw new Error("Unable to save safety budgets");refresh();
}
