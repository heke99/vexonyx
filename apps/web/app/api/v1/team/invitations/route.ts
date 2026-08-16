import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createEmailProvider } from "@/lib/email/provider";

const roles = new Set(["organization_admin", "member", "viewer"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let input: { organizationId?: unknown; email?: unknown; role?: unknown };
  try { input = await request.json() as typeof input; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const organizationId = String(input.organizationId ?? "").trim().slice(0, 36);
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 320);
  const role = String(input.role ?? "member").trim().slice(0, 40);
  if (!/^[0-9a-f-]{36}$/i.test(organizationId) || !emailPattern.test(email) || !roles.has(role)) {
    return NextResponse.json({ error: "Invalid invitation details." }, { status: 400 });
  }

  const { data, error } = await supabase.schema("app").rpc("create_organization_invitation", {
    p_organization_id: organizationId,
    p_email: email,
    p_role: role,
  });
  if (error) {
    const forbidden = /admin_required|unauthorized/i.test(error.message);
    const conflict = /already_member/i.test(error.message);
    return NextResponse.json({ error: forbidden ? "Organization admin access required." : conflict ? "That email is already a member." : "Unable to create invitation." }, { status: forbidden ? 403 : conflict ? 409 : 400 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.invitation_id || !row?.raw_token) return NextResponse.json({ error: "Unable to create invitation." }, { status: 500 });

  const { data: organization } = await supabase.schema("app").from("organizations").select("name").eq("id", organizationId).maybeSingle();
  const invitationUrl = new URL(`/invite/${row.invitation_id}`, request.url);
  invitationUrl.searchParams.set("token", row.raw_token);
  const delivery = await createEmailProvider().sendOrganizationInvitation({
    to: email,
    organizationName: organization?.name ?? "VEXONYX workspace",
    role: role.replace("organization_", "").replaceAll("_", " "),
    invitationUrl: invitationUrl.toString(),
  });

  return NextResponse.json({
    ok: true,
    invitationId: row.invitation_id,
    expiresAt: row.expires_at,
    delivery: delivery.sent ? "sent" : delivery.reason,
    invitationUrl: delivery.sent ? undefined : invitationUrl.toString(),
  }, { status: delivery.sent ? 201 : 202, headers: { "cache-control": "no-store" } });
}
