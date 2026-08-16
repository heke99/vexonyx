import Link from "next/link";
import { Brand } from "./brand";
import styles from "./customer-app.module.css";

const workspaceItems = [
  ["/app", "Home", "⌂"],
  ["/app/chat", "Chats", "✦"],
  ["/app/projects", "Projects", "◇"],
  ["/app/agents", "Agents", "⌁"],
  ["/app/files", "Files", "▤"],
  ["/app/findings", "Findings", "△"],
  ["/app/reports", "Reports", "▦"],
] as const;

const accountItems = [
  ["/app/integrations", "Connectors & plugins", "⛓"],
  ["/app/usage", "Usage", "◫"],
  ["/app/billing", "Plan & credits", "¤"],
  ["/app/team", "Team", "◎"],
  ["/app/settings", "Settings", "⚙"],
] as const;

function NavItem({ href, label, icon, readOnly }: { href: string; label: string; icon: string; readOnly: boolean }) {
  if (readOnly) return <span className={styles.navItemDisabled}><span className={styles.navIcon}>{icon}</span>{label}</span>;
  return <Link className={styles.navItem} href={href}><span className={styles.navIcon}>{icon}</span>{label}</Link>;
}

export function CustomerAppShell({ children, readOnly = false, preview, displayName = "VEXONYX user" }: { children: React.ReactNode; readOnly?: boolean; preview?: React.ReactNode; displayName?: string }) {
  return <>
    {preview ? <div className={styles.previewWrap}>{preview}</div> : null}
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandWrap}><Brand /></div>
        {readOnly ? <span className={styles.primaryActionDisabled}>+ New chat</span> : <Link className={styles.primaryAction} href="/app/chat">+ New chat</Link>}
        <nav className={styles.nav} aria-label="VEXONYX workspace navigation">
          <span className={styles.navLabel}>WORKSPACE</span>
          {workspaceItems.map(([href,label,icon]) => <NavItem key={href} href={href} label={label} icon={icon} readOnly={readOnly} />)}
          <span className={styles.navLabel}>ACCOUNT</span>
          {accountItems.map(([href,label,icon]) => <NavItem key={href} href={href} label={label} icon={icon} readOnly={readOnly} />)}
        </nav>
        <div className={styles.sidebarFooter}><b>{displayName}</b><span>{readOnly ? "Read-only customer preview" : "Personal security workspace"}</span></div>
      </aside>
      <main className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}><span className={styles.statusDot} /><span>VEXONYX workspace</span></div>
          <div className={styles.topbarRight}><strong>{readOnly ? "Preview mode" : "Authorized use only"}</strong></div>
        </header>
        {children}
      </main>
    </div>
  </>;
}

export { styles as customerAppStyles };
