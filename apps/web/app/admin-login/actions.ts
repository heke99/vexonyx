"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEmailProvider } from "@/lib/email/provider";

const ADMIN_ORIGIN = "https://admin.vexonyx.com";

export async function requestAdminMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const admin = createAdminClient();
  if (!admin) redirect("/admin-login?error=configuration");

  const { data: allowed, error: allowError } = await admin.rpc("vexonyx_is_superadmin_email", { p_email: email });
  if (allowError || allowed !== true) {
    redirect("/admin-login?sent=1");
  }

  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount } = await admin
    .schema("audit")
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "admin.magic_link_sent")
    .gte("created_at", cutoff);

  if ((recentCount ?? 0) > 0) {
    redirect("/admin-login?sent=1");
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${ADMIN_ORIGIN}/admin-confirm` },
  });

  if (error || !data?.properties?.hashed_token) {
    await admin.schema("audit").from("audit_logs").insert({
      actor_type: "system",
      action: "admin.magic_link_failed",
      resource_type: "admin_session",
      metadata: { reason: error?.message ?? "missing_token" },
    });
    redirect("/admin-login?error=delivery");
  }

  const loginUrl = `${ADMIN_ORIGIN}/admin-confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}`;
  const delivery = await createEmailProvider().sendAdminMagicLink({ to: email, loginUrl });

  await admin.schema("audit").from("audit_logs").insert({
    actor_type: "system",
    action: delivery.sent ? "admin.magic_link_sent" : "admin.magic_link_failed",
    resource_type: "admin_session",
    metadata: { email, delivery: delivery.sent ? "sent" : delivery.reason },
  });

  if (!delivery.sent) redirect("/admin-login?error=delivery");
  redirect("/admin-login?sent=1");
}
