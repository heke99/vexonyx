"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: FormDataEntryValue | null) {
  const next = String(value ?? "/app");
  return next.startsWith("/app") || next.startsWith("/invite/") ? next.slice(0, 2048) : "/app";
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 320);
  const password = String(formData.get("password") ?? "").slice(0, 128);
  const next = safeNext(formData.get("next"));
  if (!email || !password) redirect(`/login?error=credentials&next=${encodeURIComponent(next)}`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect(`/login?error=credentials&next=${encodeURIComponent(next)}`);

  if (!next.startsWith("/invite/")) {
    const { data: memberships, error: membershipError } = await supabase
      .schema("app")
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", data.user.id)
      .limit(1);
    if (membershipError || !memberships?.length) {
      await supabase.auth.signOut();
      redirect(`/login?error=access&next=${encodeURIComponent(next)}`);
    }
  }

  redirect(next);
}
