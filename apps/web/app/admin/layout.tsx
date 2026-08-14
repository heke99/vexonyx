import Link from "next/link";
import { Brand } from "@/components/brand";
import { requireSuperadmin } from "@/lib/admin/guard";
import { signOutAdmin } from "./actions";
import "./admin.css";

const groups = [
  { label: "Overview", items: [["/admin", "Command center", "⌂"]] },
  { label: "Growth", items: [["/admin/waitlist", "Waitlist", "↗"],["/admin/users", "Users", "◎"],["/admin/organizations", "Organizations", "◇"]] },
  { label: "Product", items: [["/admin/usage", "Usage & cost", "◫"],["/admin/inference", "AI requests", "✦"],["/admin/agents", "Agent runs", "⌁"],["/admin/jobs", "Jobs", "≋"],["/admin/findings", "Findings", "△"],["/admin/reports", "Reports", "▤"]] },
  { label: "Security", items: [["/admin/security", "Approvals", "✓"],["/admin/audit", "Audit log", "⌕"]] },
  { label: "Operations", items: [["/admin/platform", "Platform", "◉"],["/admin/feature-flags", "Feature flags", "⚑"],["/admin/models", "Model registry", "◈"],["/admin/deployments", "Deployments", "⬡"]] },
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
        <div className="admin-sidebar-footer">
          <div className="admin-avatar">{String(profile.display_name ?? "A").slice(0,1).toUpperCase()}</div>
          <div><b>{profile.display_name || "Superadmin"}</b><small>Privileged access</small></div>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <div><span className="admin-live-dot" /> Production</div>
          <div className="admin-topbar-links"><a href="https://www.vexonyx.com">View website</a><form action={signOutAdmin}><button className="admin-button" type="submit">Sign out</button></form></div>
        </header>
        {children}
      </main>
    </div>
  );
}
