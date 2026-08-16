import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  return <div className="app-shell"><AppSidebar /><main className="app-main"><header className="app-topbar"><span>Authorized security workspace</span><span>External actions off until explicitly enabled</span></header>{children}</main></div>;
}
