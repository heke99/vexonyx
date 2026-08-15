import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <strong>VEXONYX</strong>
        <p>
          AI platform for cybersecurity and authorized penetration testing. Operated by Diversa Solutions LLC, Wyoming, United States. Contact: <a href="mailto:info@vexonyx.com">info@vexonyx.com</a>.
        </p>
        <nav aria-label="Legal">
          <Link href="/legal">Legal</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refunds">Refunds</Link>
          <Link href="/cookies">Cookies</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <span>© 2026 Diversa Solutions LLC</span>
      </div>
    </footer>
  );
}
