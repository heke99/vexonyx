"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type WaitlistAccessState = { error?: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createWaitlistAccount(_previous: WaitlistAccessState, formData: FormData): Promise<WaitlistAccessState> {
  const entry = String(formData.get("entry") ?? "");
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!uuidPattern.test(entry) || token.length < 32 || token.length > 128) return { error: "This access link is invalid or expired." };
  if (password.length < 12 || password.length > 128) return { error: "Use a password with at least 12 characters." };
  if (password !== confirmPassword) return { error: "The passwords do not match." };

  const admin = createAdminClient();
  if (!admin) return { error: "Account activation is temporarily unavailable." };

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const inspected = await admin.schema("launch").rpc("inspect_waitlist_invitation", {
    p_entry_id: entry,
    p_token_hash: tokenHash,
  });
  if (inspected.error) return { error: "This access link is invalid or expired." };
  const invitation = Array.isArray(inspected.data) ? inspected.data[0] : inspected.data;
  if (!invitation?.invitation_id || !invitation?.email) return { error: "This access link is invalid or expired." };

  const created = await admin.auth.admin.createUser({
    email: String(invitation.email),
    password,
    email_confirm: true,
    user_metadata: invitation.name ? { name: String(invitation.name) } : {},
    app_metadata: {
      vexonyx_internal_provisioning: "waitlist",
      waitlist_entry_id: entry,
      waitlist_invitation_id: String(invitation.invitation_id),
    },
  });
  if (created.error || !created.data.user) {
    return { error: "Unable to activate this invitation. If you already created your account, use Sign in instead." };
  }

  const supabase = await createClient();
  const signedIn = await supabase.auth.signInWithPassword({ email: String(invitation.email), password });
  if (signedIn.error || !signedIn.data.user) redirect("/login?next=%2Fapp");
  redirect("/app");
}
