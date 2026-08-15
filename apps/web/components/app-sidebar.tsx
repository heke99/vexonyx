import Link from "next/link";
import { Brand } from "./brand";

export function AppSidebar() {
  return <aside className="app-sidebar">
    <Brand />
    <nav aria-label="Workspace navigation">
      <Link className="button button-small" href="/app/chat">+ New chat</Link>
      <Link href="/app/projects">+ New project</Link>

      <span className="nav-group">WORKSPACE</span>
      <Link href="/app">Overview</Link>
      <Link href="/app/chat">Chats</Link>
      <Link href="/app/projects">Projects</Link>
      <Link href="/app/agents">Agents</Link>
      <Link href="/app/files">Files</Link>
      <Link href="/app/findings">Findings</Link>
      <Link href="/app/reports">Reports</Link>
      <Link href="/app/activity">Activity</Link>

      <span className="nav-group">ACCOUNT</span>
      <Link href="/app/usage">Usage</Link>
      <Link href="/app/billing">Plan & credits</Link>
      <Link href="/app/integrations">Connectors & plugins</Link>
      <Link href="/app/team">Team</Link>
      <Link href="/app/settings">Settings & security</Link>
    </nav>
  </aside>;
}
