import Link from "next/link";
import { HeroWorkspace } from "@/components/hero-workspace";
import { MarketingHeader } from "@/components/marketing-header";
import { WaitlistForm } from "@/components/waitlist-form";

const proof = [
  ["Authorized by design", "Engagement scope and authorization stay outside model control and are re-checked before active execution."],
  ["Evidence with provenance", "Findings, files, tool observations and report artifacts retain their source and version history."],
  ["Models are replaceable", "Routing, context, memory and agent state belong to VEXONYX—not to a single model provider."],
];

export default function HomePage() {
  return <main className="marketing-page"><MarketingHeader />
    <section className="hero shell">
      <div className="hero-copy"><div className="kicker"><span /> AI-native security workspace</div><h1>AI agents for modern security teams</h1><p>Vexonyx combines AI agents, security workflows, projects, evidence and reporting in one workspace built for authorized security teams.</p><div className="hero-actions"><Link className="button" href="/waitlist">Join the waitlist</Link><Link className="button secondary" href="#workflow">See how it works <span>↘</span></Link></div><div className="trust-row"><span>Tenant-isolated</span><span>Scope-aware</span><span>Audit-ready</span><span>Self-hosted AI ready</span></div></div>
      <HeroWorkspace />
    </section>
    <section className="proof-strip"><div className="shell proof-grid">{proof.map(([title, text], i) => <article key={title}><span>0{i+1}</span><h2>{title}</h2><p>{text}</p></article>)}</div></section>
    <section className="section shell" id="workflow"><div className="section-label">WORKFLOW</div><div className="section-heading"><h2>From authorized scope to validated evidence.</h2><p>Agents operate inside a persistent project context, not a disposable chat window.</p></div><div className="workflow-grid"><div className="workflow-list">{["Define engagement & authorization","Load project context","Plan with the right model","Validate every tool boundary","Collect normalized evidence","Review findings & ship report"].map((x,i)=><div key={x}><b>{String(i+1).padStart(2,"0")}</b><span>{x}</span></div>)}</div><div className="architecture-card"><div className="architecture-top"><span>CONTROL PLANE</span><span className="status-dot">online</span></div><div className="arch-flow"><span>Identity</span><i>→</i><span>Tenant</span><i>→</i><span>Project</span><i>→</i><span>Scope</span></div><div className="arch-core">VEXONYX AGENT RUNTIME<small>Context · Router · Memory · Budget · Checkpoints</small></div><div className="arch-flow"><span>Model</span><i>↔</i><span>Tool gateway</span><i>↔</i><span>Sandbox</span></div><div className="arch-footer">Retrieved content remains untrusted data</div></div></div></section>
    <section className="section section-muted"><div className="shell"><div className="section-label">WORKSPACE</div><div className="feature-cards"><article><span>01 / PROJECTS</span><h3>Keep the whole assessment together.</h3><p>Targets, authorizations, files, notes, agent activity and findings remain attached to one project context.</p></article><article><span>02 / FINDINGS</span><h3>Move from potential to verified.</h3><p>Track confidence, evidence provenance, review state and remediation without losing the trail back to the original artifact.</p></article><article><span>03 / REPORTS</span><h3>Reporting is part of the workflow.</h3><p>Build executive and technical views from the same validated findings instead of reconstructing work at the end.</p></article></div></div></section>
    <section className="section shell privacy-section"><div><div className="section-label">PRIVATE BY ARCHITECTURE</div><h2>Your security context should not become someone else’s training data.</h2><p>VEXONYX is designed around self-hosted inference, explicit model routing, tenant-bound retrieval and server-side authorization.</p></div><div className="privacy-stack"><span>Browser</span><i>↓</i><span>VEXONYX API</span><i>↓</i><span>AI Gateway</span><i>↓</i><span>Private inference</span></div></section>
    <section className="waitlist-cta"><div className="shell waitlist-inner"><div><div className="section-label">PRIVATE BETA</div><h2>Build security work on a stronger foundation.</h2><p>Join the waitlist for VEXONYX private beta.</p></div><WaitlistForm compact /></div></section>
    <footer className="site-footer"><div className="shell footer-grid"><strong>VEXONYX</strong><p>AI-native security operating environment for authorized teams.</p><nav><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/acceptable-use">Acceptable use</Link><Link href="/contact">Contact</Link></nav><span>© 2026 VEXONYX</span></div></footer>
  </main>;
}
