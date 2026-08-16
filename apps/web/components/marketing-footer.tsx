import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <strong>VEXONYX</strong>
        <p>
          AI platform for cybersecurity and authorized penetration testing. Operated by Diversa Solutions LLC, Wyoming, United States. Contact: <a href="mailto:info@vexonyx.com">info@vexonyx.com</a>.
        </p>
        <nav aria-label="Footer navigation">
          <Link href="/product">Product</Link>
          <Link href="/use-cases">Use cases</Link>
          <Link href="/security">Security</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/legal">Legal</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <span>© 2026 Diversa Solutions LLC</span>
      </div>
    </footer>
  );
}
