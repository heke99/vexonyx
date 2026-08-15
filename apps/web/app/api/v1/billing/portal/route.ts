import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeRequest } from "@/lib/billing/stripe";

const BILLING_ADMIN_ROLES = new Set(["organization_owner", "organization_admin"]);

export async function POST() {
  const ws = await getWorkspace();
  if (!ws?.organizationId || !ws.userId) return NextResponse.json({ error: "organization_required" }, { status: 401 });
  if (!ws.role || !BILLING_ADMIN_ROLES.has(ws.role)) return NextResponse.json({ error: "billing_admin_required" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  const { data: customer } = await admin.schema("billing").from("billing_customers").select("provider_customer_id").eq("organization_id", ws.organizationId).maybeSingle();
  if (!customer?.provider_customer_id) return NextResponse.json({ error: "billing_customer_missing" }, { status: 404 });
  const params = new URLSearchParams({ customer: customer.provider_customer_id, return_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://vexonyx.com"}/app/billing` });
  try {
    const session = await stripeRequest("/billing_portal/sessions", params, `portal:${ws.organizationId}:${Date.now()}`);
    return typeof session.url === "string" ? NextResponse.json({ url: session.url }) : NextResponse.json({ error: "portal_failed" }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "billing_not_enabled" }, { status: 503 });
  }
}
