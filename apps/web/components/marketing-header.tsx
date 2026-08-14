import Link from "next/link";
import { Brand } from "./brand";
import styles from "./marketing-header.module.css";

const links = [
  ["Platform", "/product"], ["Agents", "/agents"], ["Use cases", "/use-cases"], ["Security", "/security"], ["Pricing", "/pricing"],
] as const;

export function MarketingHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Primary">{links.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</nav>
        <div className="header-actions">
          <span className={styles.securityBadge}>✓ Authorized testing</span>
          <Link className="text-link" href="/login">Log in</Link>
          <Link className="button button-small" href="/waitlist">Join waitlist</Link>
        </div>
      </div>
    </header>
  );
}
