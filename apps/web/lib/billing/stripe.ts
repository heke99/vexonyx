import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API = "https://api.stripe.com/v1";

type StripeCatalogProductInput = {
  resourceId: string;
  code: string;
  name: string;
  description?: string | null;
  kind: "subscription_plan" | "credit_pack";
};

type StripePriceInput = {
  resourceId: string;
  productId: string;
  currency: string;
  unitAmountMinor: number;
  interval?: "month" | "year";
  kind: "subscription_plan_price" | "credit_pack_price";
};

export function stripeSecretConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripeWebhookConfigured() {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function stripeConfigured() {
  return stripeSecretConfigured() && stripeWebhookConfigured();
}

export async function stripeRequest(path: string, params?: URLSearchParams, idempotencyKey?: string) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("stripe_not_configured");
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: params,
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof (body.error as { message?: unknown } | undefined)?.message === "string"
      ? String((body.error as { message: string }).message)
      : `stripe_http_${response.status}`;
    throw new Error(message);
  }
  return body;
}

function metadata(params: URLSearchParams, input: { resourceId: string; code?: string; kind: string }) {
  params.set("metadata[managed_by]", "vexonyx");
  params.set("metadata[vexonyx_resource_id]", input.resourceId);
  params.set("metadata[vexonyx_kind]", input.kind);
  if (input.code) params.set("metadata[vexonyx_code]", input.code);
}

function updateKey(prefix: string, resourceId: string, values: Array<string | number | boolean | null | undefined>) {
  const digest = createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 24);
  return `${prefix}:${resourceId}:${digest}`;
}

export async function createStripeCatalogProduct(input: StripeCatalogProductInput) {
  const params = new URLSearchParams();
  params.set("name", input.name);
  if (input.description) params.set("description", input.description);
  metadata(params, input);
  return stripeRequest("/products", params, `catalog-product-create:${input.resourceId}`);
}

export async function updateStripeCatalogProduct(productId: string, input: StripeCatalogProductInput & { active?: boolean }) {
  if (!/^prod_[A-Za-z0-9]+$/.test(productId)) throw new Error("invalid_stripe_product_id");
  const params = new URLSearchParams();
  params.set("name", input.name);
  params.set("description", input.description || "");
  if (typeof input.active === "boolean") params.set("active", String(input.active));
  metadata(params, input);
  return stripeRequest(
    `/products/${encodeURIComponent(productId)}`,
    params,
    updateKey("catalog-product-update", input.resourceId, [input.name, input.description || "", input.active ?? true]),
  );
}

export async function createStripeCatalogPrice(input: StripePriceInput) {
  if (!/^prod_[A-Za-z0-9]+$/.test(input.productId)) throw new Error("invalid_stripe_product_id");
  if (!Number.isSafeInteger(input.unitAmountMinor) || input.unitAmountMinor < 0) throw new Error("invalid_stripe_price_amount");
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("invalid_stripe_currency");
  const params = new URLSearchParams();
  params.set("product", input.productId);
  params.set("currency", input.currency.toLowerCase());
  params.set("unit_amount", String(input.unitAmountMinor));
  if (input.interval) params.set("recurring[interval]", input.interval);
  metadata(params, input);
  return stripeRequest("/prices", params, `catalog-price-create:${input.resourceId}`);
}

export async function deactivateStripePrice(priceId: string, resourceId: string) {
  if (!/^price_[A-Za-z0-9]+$/.test(priceId)) throw new Error("invalid_stripe_price_id");
  const params = new URLSearchParams({ active: "false" });
  return stripeRequest(`/prices/${encodeURIComponent(priceId)}`, params, `catalog-price-disable:${resourceId}`);
}

export async function retrieveStripeProduct(productId: string) {
  if (!/^prod_[A-Za-z0-9]+$/.test(productId)) throw new Error("invalid_stripe_product_id");
  return stripeRequest(`/products/${encodeURIComponent(productId)}`);
}

export async function retrieveStripePrice(priceId: string) {
  if (!/^price_[A-Za-z0-9]+$/.test(priceId)) throw new Error("invalid_stripe_price_id");
  return stripeRequest(`/prices/${encodeURIComponent(priceId)}`);
}

export function verifyStripeSignature(payload: string, signatureHeader: string | null, toleranceSeconds = 300) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const parts = signatureHeader.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || !signatures.length) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return signatures.some((candidate) => {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) return false;
    const candidateBuffer = Buffer.from(candidate, "hex");
    return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
  });
}
