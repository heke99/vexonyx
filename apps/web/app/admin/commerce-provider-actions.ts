"use server";

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

type CreditRow = {
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

function text(formData: FormData, key: string, max = 200) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}
function integer(formData: FormData, key: string, min: number, max: number) {
  const value = Number.parseInt(String(formData.get(key) ?? ""), 10);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
  return value;
}
function providerError(error: unknown) {
  return (error instanceof Error ? error.message : "provider_sync_failed").replace(/[\r\n]+/g, " ").slice(0, 500);
}
async function audit(admin: AdminClient, userId: string, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown> = {}) {
  const result = await admin.schema("audit").from("audit_logs").insert({ actor_user_id: userId, actor_type: "superadmin", action, resource_type: resourceType, resource_id: resourceId, metadata });
  if (result.error) throw result.error;
}
function refreshCommerce() {
  revalidatePath("/admin/billing");
  revalidatePath("/admin/credits");
  revalidatePath("/app/billing");
}

async function synchronizeCreditProduct(admin: AdminClient, product: CreditRow, desiredActive: boolean) {
  let providerProductId = product.provider_product_id;
  let providerPriceId = product.provider_price_id;
  try {
    const productInput = {
      resourceId: product.id,
      code: product.code,
      name: product.name,
      description: product.description,
      kind: "credit_pack" as const,
      // Product stays active as a provider catalog object; the immutable Price controls sale availability.
      active: true,
    };
    const remoteProduct = providerProductId
      ? await updateStripeCatalogProduct(providerProductId, productInput)
      : await createStripeCatalogProduct(productInput);
    providerProductId = String(remoteProduct.id || "");
    if (!/^prod_[A-Za-z0-9]+$/.test(providerProductId)) throw new Error("stripe_product_missing_id");

    // Persist the Product before price creation. If Stripe Price creation fails, retries reuse this Product
    // instead of relying on a changed idempotent Product-create payload.
    const productCheckpoint = await admin.schema("billing").from("credit_products").update({
      provider: "stripe",
      provider_product_id: providerProductId,
      provider_sync_status: "pending",
      provider_sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", product.id);
    if (productCheckpoint.error) throw productCheckpoint.error;

    if (providerPriceId) {
      const remotePrice = await retrieveStripePrice(providerPriceId);
      if (String(remotePrice.product || "") !== providerProductId) throw new Error("stripe_price_product_mismatch");
    } else {
      const remotePrice = await createStripeCatalogPrice({
        resourceId: product.id,
        productId: providerProductId,
        currency: product.currency,
        unitAmountMinor: Number(product.unit_amount_minor),
        kind: "credit_pack_price",
      });
      providerPriceId = String(remotePrice.id || "");
      if (!/^price_[A-Za-z0-9]+$/.test(providerPriceId)) throw new Error("stripe_price_missing_id");
    }

    await setStripePriceActive(providerPriceId, product.id, desiredActive);
    const completed = await admin.schema("billing").from("credit_products").update({
      provider_product_id: providerProductId,
      provider_price_id: providerPriceId,
      provider_sync_status: "synced",
      provider_sync_error: null,
      provider_synced_at: new Date().toISOString(),
      active: desiredActive,
      updated_at: new Date().toISOString(),
    }).eq("id", product.id);
    if (completed.error) throw completed.error;
    return { ok: true as const, providerProductId, providerPriceId };
  } catch (error) {
    const message = providerError(error);
    await admin.schema("billing").from("credit_products").update({
      ...(providerProductId ? { provider_product_id: providerProductId } : {}),
      ...(providerPriceId ? { provider_price_id: providerPriceId } : {}),
      provider_sync_status: "error",
      provider_sync_error: message,
      active: false,
      updated_at: new Date().toISOString(),
    }).eq("id", product.id);
    return { ok: false as const, error: message };
  }
}

export async function createCreditProductProviderBacked(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const code = text(formData, "code", 64).toLowerCase();
  const name = text(formData, "name", 120);
  const description = text(formData, "description", 1000);
  const credits = integer(formData, "credits", 1, 1000000000);
  const amount = integer(formData, "unit_amount_minor", 1, 1000000000);
  const currency = text(formData, "currency", 3).toUpperCase();
  const desiredActive = String(formData.get("active")) === "true";
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
  const product = created.data as CreditRow;
  const result = await synchronizeCreditProduct(admin, product, desiredActive);
  await audit(admin, userId, "billing.credit_product_created", "credit_product", product.id, { code, credits, amount, currency, provider_sync: result.ok ? "synced" : "error", active: result.ok && desiredActive });
  refreshCommerce();
}

export async function retryCreditProductProviderSyncSafe(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const productId = text(formData, "product_id", 64);
  const query = await admin.schema("billing").from("credit_products").select("id,code,name,description,credits,currency,unit_amount_minor,provider_product_id,provider_price_id,provider_sync_status,active").eq("id", productId).single();
  if (query.error) throw query.error;
  const result = await synchronizeCreditProduct(admin, query.data as CreditRow, Boolean(query.data.active));
  await audit(admin, userId, "billing.credit_product_provider_sync_retried", "credit_product", productId, { success: result.ok });
  refreshCommerce();
}

export async function setCreditProductActiveSafe(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const productId = text(formData, "product_id", 64);
  const active = text(formData, "active", 5) === "true";
  const query = await admin.schema("billing").from("credit_products").select("id,code,name,description,provider_product_id,provider_price_id,provider_sync_status,active").eq("id", productId).single();
  if (query.error) throw query.error;
  const product = query.data;
  if (!product.provider_product_id || !product.provider_price_id || product.provider_sync_status !== "synced") throw new Error("Stripe credit product is not synced");

  if (active) {
    await updateStripeCatalogProduct(product.provider_product_id, { resourceId: productId, code: product.code, name: product.name, description: product.description, kind: "credit_pack", active: true });
    await setStripePriceActive(product.provider_price_id, productId, true);
    const saved = await admin.schema("billing").from("credit_products").update({ active: true, provider_sync_error: null, updated_at: new Date().toISOString() }).eq("id", productId);
    if (saved.error) throw saved.error;
  } else {
    // Local availability closes first. Any provider failure after this point remains fail-closed to VEXONYX customers.
    const saved = await admin.schema("billing").from("credit_products").update({ active: false, updated_at: new Date().toISOString() }).eq("id", productId);
    if (saved.error) throw saved.error;
    try {
      await setStripePriceActive(product.provider_price_id, productId, false);
      await updateStripeCatalogProduct(product.provider_product_id, { resourceId: productId, code: product.code, name: product.name, description: product.description, kind: "credit_pack", active: false });
      await admin.schema("billing").from("credit_products").update({ provider_sync_error: null, provider_synced_at: new Date().toISOString() }).eq("id", productId);
    } catch (error) {
      await admin.schema("billing").from("credit_products").update({ provider_sync_error: providerError(error) }).eq("id", productId);
    }
  }
  await audit(admin, userId, active ? "billing.credit_product_activated" : "billing.credit_product_deactivated", "credit_product", productId);
  refreshCommerce();
}

export async function setPlanPriceActiveSafe(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const priceId = text(formData, "price_id", 64);
  const active = text(formData, "active", 5) === "true";
  const query = await admin.schema("billing").from("plan_prices").select("id,plan_id,provider_price_id,provider_sync_status,active").eq("id", priceId).single();
  if (query.error) throw query.error;
  const price = query.data;
  if (!price.provider_price_id || price.provider_sync_status !== "synced") throw new Error("Stripe price is not synced");

  if (!active) {
    const plan = await admin.schema("billing").from("plans").select("status,is_public").eq("id", price.plan_id).single();
    if (plan.error) throw plan.error;
    if (plan.data.status === "active" && plan.data.is_public) {
      const other = await admin.schema("billing").from("plan_prices").select("id", { count: "exact", head: true })
        .eq("plan_id", price.plan_id)
        .neq("id", priceId)
        .eq("active", true)
        .eq("provider_sync_status", "synced")
        .not("provider_price_id", "is", null);
      if (other.error) throw other.error;
      if (!other.count) throw new Error("Publish another synced active price before deactivating the last checkout price");
    }
  }

  // Preflight above runs before Stripe so a DB guard cannot leave remote/local state inverted.
  await setStripePriceActive(price.provider_price_id, priceId, active);
  const updated = await admin.schema("billing").from("plan_prices").update({ active, effective_to: active ? null : new Date().toISOString() }).eq("id", priceId);
  if (updated.error) {
    // Compensate provider state when the local commit unexpectedly fails.
    try { await setStripePriceActive(price.provider_price_id, priceId, Boolean(price.active)); } catch { /* audit path below still exposes local failure */ }
    throw updated.error;
  }
  await audit(admin, userId, active ? "billing.plan_price_activated" : "billing.plan_price_deactivated", "billing_plan_price", priceId);
  refreshCommerce();
}
