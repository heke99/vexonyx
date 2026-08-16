import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase.schema("app").from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return <CustomerAppShell displayName={String(profile?.display_name || "VEXONYX user")}>{children}</CustomerAppShell>;
}
