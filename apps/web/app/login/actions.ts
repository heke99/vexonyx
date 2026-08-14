"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeLocalPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeLocalPath(String(formData.get("next") ?? ""), "/app");
  const nextParam = next === "/app" ? "" : `&next=${encodeURIComponent(next)}`;
  if (!email || password.length < 8) redirect(`/login?error=invalid${nextParam}`);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=credentials${nextParam}`);
  revalidatePath("/", "layout");
  redirect(next);
}
