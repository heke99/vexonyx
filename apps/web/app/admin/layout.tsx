import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { requireSuperadmin } from "@/lib/admin/guard";
import { signOutAdmin } from "./actions";
import "./admin.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

const groups = [
  { label: "Overview", items: [["/admin", "Command center", "⌂"]] },
  { label: "Growth", items: [["/admin/waitlist", "Waitlist", "↗"],["/admin/users", "Users", "◎"],["/admin/organizations", "Organizations", "◇"],["/admin/audience", "Audience & email", "✉"]] },
  { label: "Commerce", items: [["/admin/billing", "Plans & billing", "¤"],["/admin/credits", "Credits", "◐"],["/admin/tax", "Tax readiness", "%"],["/admin/usage", "Usage & cost", "◫"]] },
  { label: "AI", items: [["/admin/ai", "AI Control Center", "✦"],["/admin/models", "Models", "◈"],["/admin/model-router", "Model Router", "⇄"],["/admin/agent-profiles", "Agent Profiles", "⌁"],["/admin/policies", "Policies", "⬢"],["/admin/tools", "Tools", "⌘"],["/admin/memory", "Memory", "◫"],["/admin/learning", "Learning", "↟"],["/admin/evaluations", "Evaluations", "✓"],["/admin/rollouts", "Canary & rollback", "◒"],["/admin/deployments", "Deployments", "⬡"]] },
  { label: "Security", items: [["/admin/engagements", "Engagements", "◎"],["/admin/sandboxes", "Sandboxes", "□"],["/admin/security", "Approvals", "✓"],["/admin/findings", "Findings", "△"],["/admin/account", "Account security", "◌"],["/admin/audit", "Audit log", "⌕"]] },
  { label: "Operations", items: [["/admin/platform", "Platform", "◉"],["/admin/feature-flags", "Feature flags", "⚑"],["/admin/jobs", "Jobs", "≋"],["/admin/inference", "AI requests", "⋯"],["/admin/reports", "Reports", "▤"],["/admin/integrations", "Connectors & plugins", "⛓"]] },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSuperadmin();
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><Brand /></div>
        <div className="admin-console-label"><span /> SUPERADMIN</div>
        <nav className="admin-nav" aria-label="Superadmin navigation">
          {groups.map((group) => <div className="admin-nav-group" key={group.label}><div className="admin-nav-label">{group.label}</div>{group.items.map(([href,label,icon]) => <Link href={href} key={href} className="admin-nav-link"><span className="admin-nav-icon" aria-hidden>{icon}</span><span>{label}</span></Link>)}</div>)}
        </nav>
        <div className="admin-sidebar-footer"><div className="admin-avatar">{String(profile.display_name ?? "A").slice(0,1).toUpperCase()}</div><div><b>{profile.display_name || "Superadmin"}</b><small>Privileged access</small></div></div>
      </aside>
      <main className="admin-main"><header className="admin-topbar"><div><span className="admin-live-dot" /> Production</div><div className="admin-topbar-links"><a href="https://vexonyx.com">View website</a><form action={signOutAdmin}><button className="admin-button" type="submit">Sign out</button></form></div></header>{children}</main>
    </div>
  );
}
