"use server";

import { redirect } from "next/navigation";
import { safeLocalPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("name") ?? "").trim().slice(0, 120);
  const next = safeLocalPath(String(formData.get("next") ?? ""), "/app");
  const nextQuery = next === "/app" ? "" : `&next=${encodeURIComponent(next)}`;
  if (!email || password.length < 10) redirect(`/signup?error=invalid${nextQuery}`);
  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const confirmationUrl = new URL("/auth/confirm", origin);
  if (next !== "/app") confirmationUrl.searchParams.set("next", next);
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: confirmationUrl.toString() } });
  if (error) redirect(`/signup?error=signup${nextQuery}`);
  redirect(`/signup?created=1${nextQuery}`);
}
