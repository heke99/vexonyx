"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/admin/guard";
import {
  createStripeCatalogPrice,
  createStripeCatalogProduct,
  retrieveStripePrice,
  setStripePriceActive,
  updateStripeCatalogProduct,
} from "@/lib/billing/stripe";

type AdminClient = Awaited<ReturnType<typeof requireSuperadmin>>["admin"];
type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  is_public: boolean;
  provider: string;
  provider_product_id: string | null;
  provider_sync_status: string;
};
type PlanPriceRow = {
  id: string;
  plan_id: string;
  billing_interval: "month" | "year";
  currency: string;
  unit_amount_minor: number;
  provider_price_id: string | null;
  provider_sync_status: string;
  active: boolean;
};
type CreditProductRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  credits: number;
  currency: string;
  unit_amount_minor: number;
  provider_product_id: string | null;
  provider_price_id: string | null;
  provider_sync_status: string;
  active: boolean;
};

async function audit(admin: AdminClient, userId: string, action: string, resourceType: string, resourceId?: string | null, metadata?: Record<string, unknown>) {
  const { error } = await admin.schema("audit").from("audit_logs").insert({
    actor_user_id: userId,
    actor_type: "superadmin",
    action,
    resource_type: resourceType,
    resource_id: resourceId || null,
    metadata: metadata ?? {},
  });
  if (error) throw error;
}

function text(formData: FormData, key: string, max = 200) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}
function integer(formData: FormData, key: string, min: number, max: number) {
  const n = Number.parseInt(String(formData.get(key) ?? ""), 10);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Invalid ${key}`);
  return n;
}
function providerError(error: unknown) {
  const value = error instanceof Error ? error.message : "provider_sync_failed";
  return value.replace(/[\r\n]+/g, " ").slice(0, 500);
}
function refreshBilling() {
  revalidatePath("/admin/billing");
  revalidatePath("/admin/credits");
  revalidatePath("/app/billing");
}

async function markPlanSyncError(admin: AdminClient, plan: PlanRow, error: unknown) {
  const message = providerError(error);
  const patch = plan.is_public && plan.provider_sync_status === "synced"
    ? { provider_sync_error: message }
    : { provider_sync_status: "error", provider_sync_error: message, provider_synced_at: null };
  await admin.schema("billing").from("plans").update(patch).eq("id", plan.id);
  return message;
}

async function syncPlanProduct(admin: AdminClient, plan: PlanRow, active = plan.status !== "retired") {
  try {
    const input = {
      resourceId: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      kind: "subscription_plan" as const,
      active,
    };
    const remote = plan.provider_product_id
      ? await updateStripeCatalogProduct(plan.provider_product_id, input)
      : await createStripeCatalogProduct(input);
    const productId = String(remote.id || "");
    if (!/^prod_[A-Za-z0-9]+$/.test(productId)) throw new Error("stripe_product_missing_id");
    const saved = await admin.schema("billing").from("plans").update({
      provider: "stripe",
      provider_product_id: productId,
      provider_sync_status: "synced",
      provider_sync_error: null,
      provider_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", plan.id);
    if (saved.error) throw saved.error;
    return { ok: true as const, productId };
  } catch (error) {
    const message = await markPlanSyncError(admin, plan, error);
    return { ok: false as const, error: message };
  }
}

async function syncPlanPrice(admin: AdminClient, price: PlanPriceRow, plan: PlanRow, desiredActive = price.active) {
  if (plan.provider_sync_status !== "synced" || !plan.provider_product_id) {
    const message = "plan_product_not_synced";
    await admin.schema("billing").from("plan_prices").update({ provider_sync_status: "error", provider_sync_error: message }).eq("id", price.id);
    return { ok: false as const, error: message };
  }
  try {
    let priceId = price.provider_price_id;
    if (priceId) {
      const remote = await retrieveStripePrice(priceId);
      if (String(remote.product || "") !== plan.provider_product_id) throw new Error("stripe_price_product_mismatch");
    } else {
      const remote = await createStripeCatalogPrice({
        resourceId: price.id,
        productId: plan.provider_product_id,
        currency: price.currency,
        unitAmountMinor: Number(price.unit_amount_minor),
        interval: price.billing_interval,
        kind: "subscription_plan_price",
      });
      priceId = String(remote.id || "");
      if (!/^price_[A-Za-z0-9]+$/.test(priceId)) throw new Error("stripe_price_missing_id");
    }
    await setStripePriceActive(priceId, price.id, desiredActive);
    const saved = await admin.schema("billing").from("plan_prices").update({
      provider: "stripe",
      provider_price_id: priceId,
      provider_sync_status: "synced",
      provider_sync_error: null,
      provider_synced_at: new Date().toISOString(),
      active: desiredActive,
      effective_to: desiredActive ? null : new Date().toISOString(),
    }).eq("id", price.id);
    if (saved.error) throw saved.error;
    return { ok: true as const, priceId };
  } catch (error) {
    const message = providerError(error);
    await admin.schema("billing").from("plan_prices").update({
      provider_sync_status: "error",
      provider_sync_error: message,
      active: false,
    }).eq("id", price.id);
    return { ok: false as const, error: message };
  }
}

async function syncCreditProduct(admin: AdminClient, product: CreditProductRow, desiredActive = product.active) {
  try {
    const input = {
      resourceId: product.id,
      code: product.code,
      name: product.name,
      description: product.description,
      kind: "credit_pack" as const,
      active: desiredActive,
    };
    const remoteProduct = product.provider_product_id
      ? await updateStripeCatalogProduct(product.provider_product_id, input)
      : await createStripeCatalogProduct(input);
    const productId = String(remoteProduct.id || "");
    if (!/^prod_[A-Za-z0-9]+$/.test(productId)) throw new Error("stripe_product_missing_id");

    let priceId = product.provider_price_id;
    if (priceId) {
      const remotePrice = await retrieveStripePrice(priceId);
      if (String(remotePrice.product || "") !== productId) throw new Error("stripe_price_product_mismatch");
    } else {
      const remotePrice = await createStripeCatalogPrice({
        resourceId: product.id,
        productId,
        currency: product.currency,
        unitAmountMinor: Number(product.unit_amount_minor),
        kind: "credit_pack_price",
      });
      priceId = String(remotePrice.id || "");
      if (!/^price_[A-Za-z0-9]+$/.test(priceId)) throw new Error("stripe_price_missing_id");
    }
    await setStripePriceActive(priceId, product.id, desiredActive);
    const saved = await admin.schema("billing").from("credit_products").update({
      provider: "stripe",
      provider_product_id: productId,
      provider_price_id: priceId,
      provider_sync_status: "synced",
      provider_sync_error: null,
      provider_synced_at: new Date().toISOString(),
      active: desiredActive,
      updated_at: new Date().toISOString(),
    }).eq("id", product.id);
    if (saved.error) throw saved.error;
    return { ok: true as const, productId, priceId };
  } catch (error) {
    const message = providerError(error);
    await admin.schema("billing").from("credit_products").update({
      provider_sync_status: "error",
      provider_sync_error: message,
      active: false,
      updated_at: new Date().toISOString(),
    }).eq("id", product.id);
    return { ok: false as const, error: message };
  }
}

export async function savePlan(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const code = text(formData, "code", 64).toLowerCase();
  const name = text(formData, "name", 120);
  const description = text(formData, "description", 1000);
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(code) || name.length < 2) throw new Error("Invalid plan");

  const result = await admin.schema("billing").from("plans").insert({
    code,
    name,
    description,
    status: "draft",
    is_public: false,
    provider: "stripe",
    provider_sync_status: "pending",
  }).select("id,code,name,description,status,is_public,provider,provider_product_id,provider_sync_status").single();
  if (result.error) throw result.error;
  const plan = result.data as PlanRow;
  const synced = await syncPlanProduct(admin, plan);
  await audit(admin, userId, "billing.plan_created", "billing_plan", plan.id, { code, provider_sync: synced.ok ? "synced" : "error" });
  refreshBilling();
}

export async function retryPlanProviderSync(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const planId = text(formData, "plan_id", 64);
  const result = await admin.schema("billing").from("plans").select("id,code,name,description,status,is_public,provider,provider_product_id,provider_sync_status").eq("id", planId).single();
  if (result.error) throw result.error;
  const synced = await syncPlanProduct(admin, result.data as PlanRow);
  await audit(admin, userId, "billing.plan_provider_sync_retried", "billing_plan", planId, { success: synced.ok });
  refreshBilling();
}

export async function publishPlan(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const planId = text(formData, "plan_id", 64);
  const plan = await admin.schema("billing").from("plans").select("id,provider_product_id,provider_sync_status").eq("id", planId).single();
  if (plan.error) throw plan.error;
  if (!plan.data.provider_product_id || plan.data.provider_sync_status !== "synced") throw new Error("Stripe product must be synced before publishing");
  const readyPrices = await admin.schema("billing").from("plan_prices").select("id", { count: "exact", head: true }).eq("plan_id", planId).eq("active", true).eq("provider_sync_status", "synced").not("provider_price_id", "is", null);
  if (readyPrices.error) throw readyPrices.error;
  if (!readyPrices.count) throw new Error("At least one synced active Stripe price is required");
  const updated = await admin.schema("billing").from("plans").update({ status: "active", is_public: true, updated_at: new Date().toISOString() }).eq("id", planId);
  if (updated.error) throw updated.error;
  await audit(admin, userId, "billing.plan_published", "billing_plan", planId);
  refreshBilling();
}

export async function retirePlan(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const planId = text(formData, "plan_id", 64);
  const result = await admin.schema("billing").from("plans").select("id,code,name,description,status,is_public,provider,provider_product_id,provider_sync_status").eq("id", planId).single();
  if (result.error) throw result.error;
  const plan = result.data as PlanRow;
  const local = await admin.schema("billing").from("plans").update({ status: "retired", is_public: false, updated_at: new Date().toISOString() }).eq("id", planId);
  if (local.error) throw local.error;
  let providerDeactivated = false;
  if (plan.provider_product_id) {
    const remote = await syncPlanProduct(admin, { ...plan, status: "retired", is_public: false }, false);
    providerDeactivated = remote.ok;
  }
  await audit(admin, userId, "billing.plan_retired", "billing_plan", planId, { provider_deactivated: providerDeactivated });
  refreshBilling();
}

export async function savePlanPrice(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const planId = text(formData, "plan_id", 64);
  const interval = text(formData, "billing_interval", 10) as "month" | "year";
  const currency = text(formData, "currency", 3).toUpperCase();
  const amount = integer(formData, "unit_amount_minor", 0, 1000000000);
  const activateAfterSync = String(formData.get("active")) === "true";
  if (!planId || !["month", "year"].includes(interval) || !/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid plan price");

  const planResult = await admin.schema("billing").from("plans").select("id,code,name,description,status,is_public,provider,provider_product_id,provider_sync_status").eq("id", planId).single();
  if (planResult.error) throw planResult.error;
  const plan = planResult.data as PlanRow;
  if (plan.provider_sync_status !== "synced" || !plan.provider_product_id) throw new Error("Sync the plan to Stripe before adding prices");

  const created = await admin.schema("billing").from("plan_prices").insert({
    plan_id: planId,
    billing_interval: interval,
    currency,
    unit_amount_minor: amount,
    provider: "stripe",
    provider_sync_status: "pending",
    active: false,
  }).select("id,plan_id,billing_interval,currency,unit_amount_minor,provider_price_id,provider_sync_status,active").single();
  if (created.error) throw created.error;
  const price = created.data as PlanPriceRow;
  const synced = await syncPlanPrice(admin, price, plan, activateAfterSync);
  await audit(admin, userId, "billing.plan_price_created", "billing_plan_price", price.id, { plan_id: planId, interval, currency, amount, provider_sync: synced.ok ? "synced" : "error", active: synced.ok && activateAfterSync });
  refreshBilling();
}

export async function retryPlanPriceProviderSync(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const priceId = text(formData, "price_id", 64);
  const priceResult = await admin.schema("billing").from("plan_prices").select("id,plan_id,billing_interval,currency,unit_amount_minor,provider_price_id,provider_sync_status,active").eq("id", priceId).single();
  if (priceResult.error) throw priceResult.error;
  const price = priceResult.data as PlanPriceRow;
  const planResult = await admin.schema("billing").from("plans").select("id,code,name,description,status,is_public,provider,provider_product_id,provider_sync_status").eq("id", price.plan_id).single();
  if (planResult.error) throw planResult.error;
  const synced = await syncPlanPrice(admin, price, planResult.data as PlanRow, price.active);
  await audit(admin, userId, "billing.plan_price_provider_sync_retried", "billing_plan_price", priceId, { success: synced.ok });
  refreshBilling();
}

export async function setPlanPriceActive(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const priceId = text(formData, "price_id", 64);
  const active = text(formData, "active", 5) === "true";
  const result = await admin.schema("billing").from("plan_prices").select("id,provider_price_id,provider_sync_status").eq("id", priceId).single();
  if (result.error) throw result.error;
  if (!result.data.provider_price_id || result.data.provider_sync_status !== "synced") throw new Error("Stripe price is not synced");
  await setStripePriceActive(result.data.provider_price_id, priceId, active);
  const updated = await admin.schema("billing").from("plan_prices").update({ active, effective_to: active ? null : new Date().toISOString() }).eq("id", priceId);
  if (updated.error) throw updated.error;
  await audit(admin, userId, active ? "billing.plan_price_activated" : "billing.plan_price_deactivated", "billing_plan_price", priceId);
  refreshBilling();
}

export async function savePlanEntitlement(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const planId = text(formData, "plan_id", 64);
  const key = text(formData, "entitlement_key", 100);
  const raw = text(formData, "entitlement_value", 4096);
  if (!planId || !/^[a-z0-9][a-z0-9_.:-]{1,99}$/.test(key)) throw new Error("Invalid entitlement key");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Entitlement value must be valid JSON"); }
  const { error } = await admin.schema("billing").from("plan_entitlements").upsert({ plan_id: planId, entitlement_key: key, entitlement_value: value, updated_at: new Date().toISOString() }, { onConflict: "plan_id,entitlement_key" });
  if (error) throw error;
  await audit(admin, userId, "billing.entitlement_saved", "billing_plan", planId, { key, value });
  revalidatePath("/admin/billing");
}

export async function saveCreditProduct(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const code = text(formData, "code", 64).toLowerCase();
  const name = text(formData, "name", 120);
  const description = text(formData, "description", 1000);
  const credits = integer(formData, "credits", 1, 1000000000);
  const amount = integer(formData, "unit_amount_minor", 1, 1000000000);
  const currency = text(formData, "currency", 3).toUpperCase();
  const activateAfterSync = String(formData.get("active")) === "true";
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(code) || name.length < 2 || !/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid credit product");

  const created = await admin.schema("billing").from("credit_products").insert({
    code,
    name,
    description,
    credits,
    unit_amount_minor: amount,
    currency,
    provider: "stripe",
    provider_sync_status: "pending",
    active: false,
  }).select("id,code,name,description,credits,currency,unit_amount_minor,provider_product_id,provider_price_id,provider_sync_status,active").single();
  if (created.error) throw created.error;
  const product = created.data as CreditProductRow;
  const synced = await syncCreditProduct(admin, product, activateAfterSync);
  await audit(admin, userId, "billing.credit_product_created", "credit_product", product.id, { code, credits, amount, currency, provider_sync: synced.ok ? "synced" : "error", active: synced.ok && activateAfterSync });
  refreshBilling();
}

export async function retryCreditProductProviderSync(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const productId = text(formData, "product_id", 64);
  const result = await admin.schema("billing").from("credit_products").select("id,code,name,description,credits,currency,unit_amount_minor,provider_product_id,provider_price_id,provider_sync_status,active").eq("id", productId).single();
  if (result.error) throw result.error;
  const synced = await syncCreditProduct(admin, result.data as CreditProductRow, result.data.active);
  await audit(admin, userId, "billing.credit_product_provider_sync_retried", "credit_product", productId, { success: synced.ok });
  refreshBilling();
}

export async function setCreditProductActive(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const productId = text(formData, "product_id", 64);
  const active = text(formData, "active", 5) === "true";
  const result = await admin.schema("billing").from("credit_products").select("id,provider_product_id,provider_price_id,provider_sync_status").eq("id", productId).single();
  if (result.error) throw result.error;
  if (!result.data.provider_product_id || !result.data.provider_price_id || result.data.provider_sync_status !== "synced") throw new Error("Stripe credit product is not synced");
  await setStripePriceActive(result.data.provider_price_id, productId, active);
  const updated = await admin.schema("billing").from("credit_products").update({ active, updated_at: new Date().toISOString() }).eq("id", productId);
  if (updated.error) throw updated.error;
  await audit(admin, userId, active ? "billing.credit_product_activated" : "billing.credit_product_deactivated", "credit_product", productId);
  refreshBilling();
}

export async function adjustCredits(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const organizationId = text(formData, "organization_id", 64);
  const amount = integer(formData, "amount", -1000000000, 1000000000);
  const reason = text(formData, "reason", 500);
  if (!organizationId || amount === 0 || reason.length < 3) throw new Error("Organization, non-zero amount and reason are required");
  const { data, error } = await admin.schema("billing").rpc("apply_credit_entry", { p_organization_id: organizationId, p_user_id: userId, p_entry_type: "admin_adjustment", p_amount: amount, p_idempotency_key: `admin:${randomUUID()}`, p_external_reference: null, p_metadata: { reason, actor_user_id: userId } });
  if (error) throw error;
  await audit(admin, userId, "billing.credits_adjusted", "organization", organizationId, { amount, reason, balance: data?.[0]?.balance ?? null });
  revalidatePath("/admin/credits");
  revalidatePath("/admin/users");
}

export async function resetUserProductHistory(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const targetUserId = text(formData, "user_id", 64);
  const confirmation = text(formData, "confirmation", 32);
  if (!targetUserId || confirmation !== "RESET HISTORY" || targetUserId === userId) throw new Error("Explicit reset confirmation required");
  const { data: profile } = await admin.schema("app").from("profiles").select("is_superadmin").eq("id", targetUserId).maybeSingle();
  if (profile?.is_superadmin) throw new Error("Superadmin history cannot be reset here");
  const { count: conversationCount, error: conversationError } = await admin.schema("app").from("conversations").delete({ count: "exact" }).eq("user_id", targetUserId);
  if (conversationError) throw conversationError;
  const { count: memoryCount, error: memoryError } = await admin.schema("ai").from("memory_items").delete({ count: "exact" }).eq("user_id", targetUserId);
  if (memoryError) throw memoryError;
  await audit(admin, userId, "user.product_history_reset", "user", targetUserId, { conversations_deleted: conversationCount ?? 0, memory_items_deleted: memoryCount ?? 0, preserved: ["audit_logs", "billing", "usage", "security_findings"] });
  revalidatePath("/admin/users");
}

export async function createAudienceExport(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const exportType = text(formData, "export_type", 20);
  if (!["waitlist", "users", "customers", "audience"].includes(exportType)) throw new Error("Invalid export type");
  const { data, error } = await admin.schema("marketing").from("exports").insert({ requested_by: userId, export_type: exportType, status: "queued" }).select("id").single();
  if (error) throw error;
  const job = await admin.schema("operations").from("jobs").insert({ queue_name: "maintenance", organization_id: null, priority: 3, status: "queued", payload: { job_type: "marketing_export", export_id: data.id }, idempotency_key: `marketing-export:${data.id}`, max_attempts: 5, available_at: new Date().toISOString() });
  if (job.error) throw job.error;
  await audit(admin, userId, "marketing.export_requested", "marketing_export", data.id, { export_type: exportType });
  revalidatePath("/admin/audience");
}

export async function createBroadcastDraft(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const subject = text(formData, "subject", 200);
  const lifecycleStage = text(formData, "lifecycle_stage", 30) || "customer";
  if (subject.length < 3) throw new Error("Subject required");
  const { data, error } = await admin.schema("marketing").from("broadcasts").insert({ created_by: userId, provider: "resend", audience_filter: { lifecycle_stage: lifecycleStage, marketing_consent: true, unsubscribed: false }, subject, status: "draft" }).select("id").single();
  if (error) throw error;
  await audit(admin, userId, "marketing.broadcast_draft_created", "broadcast", data.id, { subject, lifecycle_stage: lifecycleStage });
  revalidatePath("/admin/audience");
}
