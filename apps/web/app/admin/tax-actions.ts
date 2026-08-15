"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/admin/guard";
import {
  listActiveStripeTaxRegistrations,
  retrieveStripeTaxCode,
  retrieveStripeTaxSettings,
  updateStripeCatalogProduct,
} from "@/lib/billing/stripe";

type AdminClient = Awaited<ReturnType<typeof requireSuperadmin>>["admin"];

function text(formData: FormData, key: string, max = 200) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function audit(admin: AdminClient, userId: string, action: string, resourceType: string, resourceId?: string | null, metadata: Record<string, unknown> = {}) {
  const result = await admin.schema("audit").from("audit_logs").insert({
    actor_user_id: userId,
    actor_type: "superadmin",
    action,
    resource_type: resourceType,
    resource_id: resourceId || null,
    metadata,
  });
  if (result.error) throw result.error;
}

function refreshTaxUi() {
  revalidatePath("/admin/billing");
  revalidatePath("/app/billing");
}

export async function refreshStripeTaxState() {
  const { admin, userId } = await requireSuperadmin();
  const [settings, registrations] = await Promise.all([
    retrieveStripeTaxSettings(),
    listActiveStripeTaxRegistrations(),
  ]);
  const headOffice = asRecord(asRecord(settings.head_office).address);
  const defaults = asRecord(settings.defaults);
  const row = await admin.schema("billing").from("tax_settings").upsert({
    provider: "stripe",
    head_office: headOffice,
    default_tax_behavior: String(defaults.tax_behavior || "exclusive"),
    active_registration_count: registrations.length,
    last_registration_check_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "provider" });
  if (row.error) throw row.error;
  await audit(admin, userId, "billing.tax_state_refreshed", "tax_settings", "stripe", { active_registration_count: registrations.length });
  refreshTaxUi();
}

export async function confirmTaxClassification(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const resourceType = text(formData, "resource_type", 32);
  const resourceId = text(formData, "resource_id", 64);
  const taxCode = text(formData, "tax_code", 32);
  if (!/^txcd_[0-9]{8}$/.test(taxCode)) throw new Error("Invalid Stripe tax code");

  const canonical = await retrieveStripeTaxCode(taxCode);
  if (String(canonical.id || "") !== taxCode) throw new Error("Stripe tax code could not be verified");

  if (resourceType === "plan") {
    const query = await admin.schema("billing").from("plans")
      .select("id,code,name,description,status,provider_product_id,provider_sync_status")
      .eq("id", resourceId)
      .single();
    if (query.error) throw query.error;
    const plan = query.data;
    if (!plan.provider_product_id || plan.provider_sync_status !== "synced") throw new Error("Stripe product must be synced before tax classification");
    await updateStripeCatalogProduct(plan.provider_product_id, {
      resourceId: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      kind: "subscription_plan",
      active: plan.status !== "retired",
      taxCode,
    });
    const saved = await admin.schema("billing").from("plans").update({
      tax_code: taxCode,
      tax_code_candidate: taxCode,
      tax_classification_status: "confirmed",
      provider_synced_at: new Date().toISOString(),
      provider_sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", resourceId);
    if (saved.error) throw saved.error;
  } else if (resourceType === "credit_product") {
    const query = await admin.schema("billing").from("credit_products")
      .select("id,code,name,description,active,provider_product_id,provider_sync_status")
      .eq("id", resourceId)
      .single();
    if (query.error) throw query.error;
    const product = query.data;
    if (!product.provider_product_id || product.provider_sync_status !== "synced") throw new Error("Stripe product must be synced before tax classification");
    await updateStripeCatalogProduct(product.provider_product_id, {
      resourceId: product.id,
      code: product.code,
      name: product.name,
      description: product.description,
      kind: "credit_pack",
      active: product.active,
      taxCode,
    });
    const saved = await admin.schema("billing").from("credit_products").update({
      tax_code: taxCode,
      tax_code_candidate: taxCode,
      tax_classification_status: "confirmed",
      provider_synced_at: new Date().toISOString(),
      provider_sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", resourceId);
    if (saved.error) throw saved.error;
  } else {
    throw new Error("Unsupported tax classification resource");
  }

  await audit(admin, userId, "billing.tax_classification_confirmed", resourceType, resourceId, {
    tax_code: taxCode,
    canonical_name: String(canonical.name || ""),
  });
  refreshTaxUi();
}

export async function setAutomaticTaxCollection(formData: FormData) {
  const { admin, userId } = await requireSuperadmin();
  const enabled = text(formData, "enabled", 5) === "true";
  let registrationCount = 0;

  if (enabled) {
    const registrations = await listActiveStripeTaxRegistrations();
    registrationCount = registrations.length;
    const refreshed = await admin.schema("billing").from("tax_settings").update({
      active_registration_count: registrationCount,
      last_registration_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("provider", "stripe");
    if (refreshed.error) throw refreshed.error;
    if (!registrationCount) throw new Error("No active Stripe Tax registration exists. Register with the tax authority first, then record that registration in Stripe.");

    const [plans, creditProducts] = await Promise.all([
      admin.schema("billing").from("plans").select("id,name,tax_code,tax_classification_status").eq("status", "active").eq("is_public", true),
      admin.schema("billing").from("credit_products").select("id,name,tax_code,tax_classification_status").eq("active", true),
    ]);
    if (plans.error) throw plans.error;
    if (creditProducts.error) throw creditProducts.error;
    const incomplete = [...(plans.data ?? []), ...(creditProducts.data ?? [])]
      .filter((item) => !item.tax_code || item.tax_classification_status !== "confirmed");
    if (incomplete.length) throw new Error(`Confirm Stripe tax classification for ${incomplete.length} active catalog item(s) before enabling collection.`);
  }

  const saved = await admin.schema("billing").from("tax_settings").update({
    automatic_collection_enabled: enabled,
    ...(enabled ? { active_registration_count: registrationCount, last_registration_check_at: new Date().toISOString() } : {}),
    updated_at: new Date().toISOString(),
  }).eq("provider", "stripe");
  if (saved.error) throw saved.error;
  await audit(admin, userId, enabled ? "billing.tax_collection_enabled" : "billing.tax_collection_disabled", "tax_settings", "stripe", { active_registration_count: registrationCount });
  refreshTaxUi();
}
