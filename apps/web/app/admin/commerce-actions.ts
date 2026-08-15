"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/admin/guard";
import { stripeRequest } from "@/lib/billing/stripe";

async function audit(admin: Awaited<ReturnType<typeof requireSuperadmin>>["admin"], userId: string, action: string, resourceType: string, resourceId?: string | null, metadata?: Record<string, unknown>) {
  const { error } = await admin.schema("audit").from("audit_logs").insert({ actor_user_id:userId, actor_type:"superadmin", action, resource_type:resourceType, resource_id:resourceId || null, metadata:metadata ?? {} });
  if (error) throw error;
}

function text(formData: FormData, key: string, max = 200) { return String(formData.get(key) ?? "").trim().slice(0,max); }
function integer(formData: FormData, key: string, min: number, max: number) { const n=Number.parseInt(String(formData.get(key) ?? ""),10); if(!Number.isSafeInteger(n)||n<min||n>max) throw new Error(`Invalid ${key}`); return n; }
function object(value: unknown): Record<string,unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {}; }
function stripeId(value: unknown, prefix: "prod_"|"price_") { const id=typeof value === "string" ? value : ""; return id.startsWith(prefix) ? id : null; }

async function ensureStripeProduct(
  admin: Awaited<ReturnType<typeof requireSuperadmin>>["admin"],
  table: "plans"|"credit_products",
  input: { id:string; code:string; name:string; description?:string|null; metadata?:unknown; kind:"plan"|"credit_pack" }
) {
  const metadata=object(input.metadata);
  const existing=stripeId(metadata.provider_product_id,"prod_");
  if(existing) return existing;

  const params=new URLSearchParams();
  params.set("name",input.name);
  if(input.description) params.set("description",input.description);
  params.set("metadata[vexonyx_kind]",input.kind);
  params.set("metadata[vexonyx_catalog_id]",input.id);
  params.set("metadata[vexonyx_code]",input.code);
  const result=await stripeRequest("/products",params,`vexonyx-${input.kind}-product-${input.id}`);
  const productId=stripeId(result.id,"prod_");
  if(!productId) throw new Error("Stripe did not return a product ID");

  const {error}=await admin.schema("billing").from(table).update({metadata:{...metadata,provider_product_id:productId},updated_at:new Date().toISOString()}).eq("id",input.id);
  if(error) throw error;
  return productId;
}

async function createStripePrice(input:{productId:string;catalogId:string;kind:"plan"|"credit_pack";currency:string;amount:number;interval?:"month"|"year";credits?:number}){
  const params=new URLSearchParams();
  params.set("product",input.productId);
  params.set("currency",input.currency.toLowerCase());
  params.set("unit_amount",String(input.amount));
  if(input.interval) params.set("recurring[interval]",input.interval);
  params.set("metadata[vexonyx_kind]",input.kind);
  params.set("metadata[vexonyx_catalog_id]",input.catalogId);
  if(input.credits) params.set("metadata[vexonyx_credits]",String(input.credits));
  const versionKey=[input.kind,input.catalogId,input.interval??"once",input.currency,input.amount,input.credits??0].join("-");
  const result=await stripeRequest("/prices",params,`vexonyx-price-${versionKey}`);
  const priceId=stripeId(result.id,"price_");
  if(!priceId) throw new Error("Stripe did not return a price ID");
  return priceId;
}

export async function savePlan(formData: FormData) {
  const { admin,userId }=await requireSuperadmin();
  const planId=text(formData,"plan_id",64) || null;
  const code=text(formData,"code",64).toLowerCase(); const name=text(formData,"name",120); const description=text(formData,"description",1000);
  const status=text(formData,"status",20); const isPublic=String(formData.get("is_public"))==="true";
  if(!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(code)||name.length<2||!["draft","active","retired"].includes(status)) throw new Error("Invalid plan");
  let plan;
  if(planId){const result=await admin.schema("billing").from("plans").update({code,name,description,status,is_public:isPublic,updated_at:new Date().toISOString()}).eq("id",planId).select("id").single();if(result.error)throw result.error;plan=result.data;}
  else{const result=await admin.schema("billing").from("plans").insert({code,name,description,status,is_public:isPublic}).select("id").single();if(result.error)throw result.error;plan=result.data;}
  await audit(admin,userId,"billing.plan_saved","billing_plan",plan.id,{code,status,is_public:isPublic}); revalidatePath("/admin/billing"); revalidatePath("/app/billing");
}

export async function savePlanPrice(formData: FormData) {
  const { admin,userId }=await requireSuperadmin();
  const planId=text(formData,"plan_id",64); const interval=text(formData,"billing_interval",10) as "month"|"year"; const currency=text(formData,"currency",3).toUpperCase();
  const amount=integer(formData,"unit_amount_minor",0,1000000000); let providerPriceId=text(formData,"provider_price_id",120) || null; const active=String(formData.get("active"))==="true";
  if(!planId||!["month","year"].includes(interval)||!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid plan price");

  const {data:plan,error:planError}=await admin.schema("billing").from("plans").select("id,code,name,description,metadata").eq("id",planId).single();
  if(planError||!plan) throw planError??new Error("Plan not found");
  if(active&&!providerPriceId){
    const productId=await ensureStripeProduct(admin,"plans",{...plan,kind:"plan"});
    providerPriceId=await createStripePrice({productId,catalogId:planId,kind:"plan",currency,amount,interval});
  }
  if(active&&!stripeId(providerPriceId,"price_")) throw new Error("Active plan price requires a valid Stripe price");

  const {data,error}=await admin.schema("billing").rpc("create_plan_price_version",{
    p_plan_id:planId,p_billing_interval:interval,p_currency:currency,p_unit_amount_minor:amount,p_provider:"stripe",p_provider_price_id:providerPriceId,p_active:active
  });
  if(error)throw error;
  await audit(admin,userId,"billing.plan_price_created","billing_plan_price",String(data),{plan_id:planId,interval,currency,amount,active,provider_price_id:providerPriceId}); revalidatePath("/admin/billing"); revalidatePath("/app/billing");
}

export async function savePlanEntitlement(formData: FormData) {
  const {admin,userId}=await requireSuperadmin(); const planId=text(formData,"plan_id",64); const key=text(formData,"entitlement_key",100); const raw=text(formData,"entitlement_value",4096);
  if(!planId||!/^[a-z0-9][a-z0-9_.:-]{1,99}$/.test(key)) throw new Error("Invalid entitlement key");
  let value:unknown; try{value=JSON.parse(raw);}catch{throw new Error("Entitlement value must be valid JSON");}
  const {error}=await admin.schema("billing").from("plan_entitlements").upsert({plan_id:planId,entitlement_key:key,entitlement_value:value,updated_at:new Date().toISOString()},{onConflict:"plan_id,entitlement_key"});if(error)throw error;
  await audit(admin,userId,"billing.entitlement_saved","billing_plan",planId,{key,value});revalidatePath("/admin/billing");revalidatePath("/app/billing");
}

export async function saveCreditProduct(formData:FormData){
  const {admin,userId}=await requireSuperadmin(); const productId=text(formData,"product_id",64)||null; const code=text(formData,"code",64).toLowerCase(); const name=text(formData,"name",120); const description=text(formData,"description",1000);
  const credits=integer(formData,"credits",1,1000000000); const amount=integer(formData,"unit_amount_minor",1,1000000000); const currency=text(formData,"currency",3).toUpperCase(); let providerPriceId=text(formData,"provider_price_id",120)||null; const active=String(formData.get("active"))==="true";
  if(!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(code)||name.length<2||!/^[A-Z]{3}$/.test(currency))throw new Error("Invalid credit product");

  const basePatch={code,name,description,credits,unit_amount_minor:amount,currency,provider:"stripe",active:false,updated_at:new Date().toISOString()};
  const baseResult=productId?await admin.schema("billing").from("credit_products").update(basePatch).eq("id",productId).select("id,code,name,description,metadata,provider_price_id").single():await admin.schema("billing").from("credit_products").insert(basePatch).select("id,code,name,description,metadata,provider_price_id").single();
  if(baseResult.error)throw baseResult.error;
  const saved=baseResult.data;
  if(active&&!providerPriceId){
    const stripeProductId=await ensureStripeProduct(admin,"credit_products",{...saved,kind:"credit_pack"});
    providerPriceId=await createStripePrice({productId:stripeProductId,catalogId:saved.id,kind:"credit_pack",currency,amount,credits});
  }
  if(active&&!stripeId(providerPriceId,"price_"))throw new Error("Active credit pack requires a valid Stripe price");
  const finalUpdate=await admin.schema("billing").from("credit_products").update({provider_price_id:providerPriceId,active,updated_at:new Date().toISOString()}).eq("id",saved.id);
  if(finalUpdate.error)throw finalUpdate.error;
  await audit(admin,userId,"billing.credit_product_saved","credit_product",saved.id,{code,credits,amount,currency,active,provider_price_id:providerPriceId});revalidatePath("/admin/credits");revalidatePath("/app/billing");
}

export async function saveCreditRate(formData:FormData){
  const {admin,userId}=await requireSuperadmin();
  const metric=text(formData,"metric",80).toLowerCase(); const unit=text(formData,"unit",80).toLowerCase(); const raw=Number(String(formData.get("credits_per_unit")??"")); const active=String(formData.get("active"))==="true";
  if(!/^[a-z0-9][a-z0-9_.:-]{1,79}$/.test(metric)||!/^[a-z0-9][a-z0-9_.:-]{1,79}$/.test(unit)||!Number.isFinite(raw)||raw<=0||raw>1000000000)throw new Error("Invalid credit rate");
  const now=new Date().toISOString();
  if(active){const deactivate=await admin.schema("billing").from("credit_rates").update({active:false,effective_to:now}).eq("metric",metric).eq("unit",unit).eq("active",true);if(deactivate.error)throw deactivate.error;}
  const {data,error}=await admin.schema("billing").from("credit_rates").insert({metric,unit,credits_per_unit:raw,active,effective_from:now}).select("id").single();if(error)throw error;
  await audit(admin,userId,"billing.credit_rate_created","credit_rate",data.id,{metric,unit,credits_per_unit:raw,active});revalidatePath("/admin/credits");
}

export async function adjustCredits(formData:FormData){
  const {admin,userId}=await requireSuperadmin(); const organizationId=text(formData,"organization_id",64); const amount=integer(formData,"amount",-1000000000,1000000000); const reason=text(formData,"reason",500);
  if(!organizationId||amount===0||reason.length<3)throw new Error("Organization, non-zero amount and reason are required");
  const {data,error}=await admin.schema("billing").rpc("apply_credit_entry",{p_organization_id:organizationId,p_user_id:userId,p_entry_type:"admin_adjustment",p_amount:amount,p_idempotency_key:`admin:${randomUUID()}`,p_external_reference:null,p_metadata:{reason,actor_user_id:userId}});if(error)throw error;
  await audit(admin,userId,"billing.credits_adjusted","organization",organizationId,{amount,reason,balance:data?.[0]?.balance??null});revalidatePath("/admin/credits");revalidatePath("/admin/users");
}

export async function resetUserProductHistory(formData:FormData){
  const {admin,userId}=await requireSuperadmin(); const targetUserId=text(formData,"user_id",64); const confirmation=text(formData,"confirmation",32);
  if(!targetUserId||confirmation!=="RESET HISTORY"||targetUserId===userId)throw new Error("Explicit reset confirmation required");
  const {data:profile}=await admin.schema("app").from("profiles").select("is_superadmin").eq("id",targetUserId).maybeSingle(); if(profile?.is_superadmin)throw new Error("Superadmin history cannot be reset here");
  const {count:conversationCount,error:conversationError}=await admin.schema("app").from("conversations").delete({count:"exact"}).eq("user_id",targetUserId);if(conversationError)throw conversationError;
  const {count:memoryCount,error:memoryError}=await admin.schema("ai").from("memory_items").delete({count:"exact"}).eq("user_id",targetUserId);if(memoryError)throw memoryError;
  await audit(admin,userId,"user.product_history_reset","user",targetUserId,{conversations_deleted:conversationCount??0,memory_items_deleted:memoryCount??0,preserved:["audit_logs","billing","usage","security_findings"]});revalidatePath("/admin/users");
}

export async function createAudienceExport(formData:FormData){
  const {admin,userId}=await requireSuperadmin(); const exportType=text(formData,"export_type",20); if(!["waitlist","users","customers","audience"].includes(exportType))throw new Error("Invalid export type");
  const {data,error}=await admin.schema("marketing").from("exports").insert({requested_by:userId,export_type:exportType,status:"queued"}).select("id").single();if(error)throw error;
  const job=await admin.schema("operations").from("jobs").insert({queue_name:"maintenance",organization_id:null,priority:3,status:"queued",payload:{job_type:"marketing_export",export_id:data.id},idempotency_key:`marketing-export:${data.id}`,max_attempts:5,available_at:new Date().toISOString()});if(job.error)throw job.error;
  await audit(admin,userId,"marketing.export_requested","marketing_export",data.id,{export_type:exportType});revalidatePath("/admin/audience");
}

export async function createBroadcastDraft(formData:FormData){
  const {admin,userId}=await requireSuperadmin(); const subject=text(formData,"subject",200); const lifecycleStage=text(formData,"lifecycle_stage",30)||"customer"; if(subject.length<3)throw new Error("Subject required");
  const {data,error}=await admin.schema("marketing").from("broadcasts").insert({created_by:userId,provider:"resend",audience_filter:{lifecycle_stage:lifecycleStage,marketing_consent:true,unsubscribed:false},subject,status:"draft"}).select("id").single();if(error)throw error;
  await audit(admin,userId,"marketing.broadcast_draft_created","broadcast",data.id,{subject,lifecycle_stage:lifecycleStage});revalidatePath("/admin/audience");
}
