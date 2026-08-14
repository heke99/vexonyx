import Link from "next/link";
import { HeroAttackSurface } from "@/components/hero-attack-surface";
import { HeroWorkspace } from "@/components/hero-workspace";
import { MarketingHeader } from "@/components/marketing-header";
import { WaitlistForm } from "@/components/waitlist-form";
import heroStyles from "./home-hero.module.css";

const proof = [
  ["Pentesting workspace", "Run authorized web, API, cloud and code security assessments with scope, evidence and review connected from the start."],
  ["Security tool builder", "Create and manage reusable security tools and workflows alongside the assessments that use them."],
  ["Evidence to report", "Turn validated findings, requests, responses, screenshots, logs and notes into reviewable technical and executive reports."],
];

const capabilities = [
  "Web application testing",
  "API security testing",
  "Cloud configuration review",
  "Code security review",
  "Evidence capture",
  "Finding validation",
  "Security tool builder",
  "Technical reporting",
] as const;

export default function HomePage() {
  return <main className="marketing-page"><MarketingHeader />
    <section className={`hero shell ${heroStyles.cyber}`}>
      <div className={heroStyles.intro}>
        <div className={`hero-copy ${heroStyles.copyLeft}`}>
          <div className="kicker"><span /> CYBERSECURITY · PENETRATION TESTING · SECURITY TOOLS</div>
          <h1 className={heroStyles.headline}>AI platform for <em>cybersecurity and penetration testing</em></h1>
          <p>Run authorized security assessments, analyze targets, build and use security tools, collect evidence, validate findings and generate reports in one workspace.</p>
          <div className={`hero-actions ${heroStyles.actionsLeft}`}>
            <Link className="button" href="/waitlist">Join the waitlist <span>→</span></Link>
            <Link className="button secondary" href="#platform-preview">See the platform <span>↘</span></Link>
          </div>
          <div className={`trust-row ${heroStyles.trustLeft}`}>
            <span>Authorized testing only</span><span>Evidence-driven</span><span>Report-ready</span><span>Private AI ready</span>
          </div>
          <p className={heroStyles.audience}>Built for pentesters, security teams, independent researchers, developers and organizations running authorized security assessments.</p>
        </div>
        <HeroAttackSurface />
      </div>

      <div className={heroStyles.capabilities} aria-label="VEXONYX capabilities">
        {capabilities.map((capability) => <span key={capability}>{capability}</span>)}
      </div>

      <div className={heroStyles.previewHeading} id="platform-preview">
        <div><div className="section-label">VEXONYX WORKSPACE · SYNTHETIC PRODUCT DEMO</div><h2>See the security work, not just the AI.</h2></div>
        <p>Assessment progress, scope, findings, evidence and reporting stay visible in the same workspace.</p>
      </div>
      <HeroWorkspace />
    </section>

    <section className="proof-strip"><div className="shell proof-grid">{proof.map(([title, text], i) => <article key={title}><span>0{i+1}</span><h2>{title}</h2><p>{text}</p></article>)}</div></section>

    <section className="section shell" id="workflow"><div className="section-label">PENTEST WORKFLOW</div><div className="section-heading"><h2>From authorized target to validated finding.</h2><p>VEXONYX keeps the operational security workflow visible instead of hiding it inside a generic chat interface.</p></div><div className="workflow-grid"><div className="workflow-list">{["Define engagement & authorization","Map targets and attack surface","Run authorized assessment workflows","Collect requests, responses, logs & screenshots","Validate findings & remediation","Generate technical & executive reports"].map((x,i)=><div key={x}><b>{String(i+1).padStart(2,"0")}</b><span>{x}</span></div>)}</div><div className="architecture-card"><div className="architecture-top"><span>AUTHORIZED SECURITY WORKFLOW</span><span className="status-dot">scope verified</span></div><div className="arch-flow"><span>Target</span><i>→</i><span>Scope</span><i>→</i><span>Assessment</span><i>→</i><span>Evidence</span></div><div className="arch-core">VEXONYX SECURITY AGENT<small>Analyze · Validate · Capture evidence · Report</small></div><div className="arch-flow"><span>Findings</span><i>→</i><span>Review</span><i>→</i><span>Report</span></div><div className="arch-footer">Active security work requires explicit authorization and server-side scope checks</div></div></div></section>

    <section className="section section-muted"><div className="shell"><div className="section-label">WHAT YOU CAN DO</div><div className="feature-cards"><article><span>01 / ASSESS</span><h3>Web, API, cloud and code security reviews.</h3><p>Keep authorized targets, assessment steps and agent activity connected to the engagement that permits the work.</p></article><article><span>02 / BUILD</span><h3>Create reusable security tools and programs.</h3><p>Build custom analyzers, validators and security workflows that can be versioned and used inside your approved projects.</p></article><article><span>03 / PROVE</span><h3>Evidence, findings and reports in one flow.</h3><p>Preserve requests, responses, screenshots, logs and source references, validate findings and produce reports without reconstructing the assessment afterward.</p></article></div></div></section>

    <section className="section shell privacy-section"><div><div className="section-label">PRIVATE BY ARCHITECTURE</div><h2>Your security context should stay yours.</h2><p>VEXONYX is designed around private inference, organization-scoped retrieval and server-side authorization. Customer project data is never used implicitly for model training.</p></div><div className="privacy-stack"><span>Your authorized project</span><i>↓</i><span>VEXONYX</span><i>↓</i><span>Private AI</span><i>↓</i><span>Findings + evidence + report</span></div></section>

    <section className="waitlist-cta"><div className="shell waitlist-inner"><div><div className="section-label">PRIVATE BETA · CYBERSECURITY</div><h2>Join VEXONYX before the private beta opens.</h2><p>Pentesters, researchers, developers and security teams can all join. Tell us who you are and we will keep your place after email verification.</p></div><WaitlistForm compact /></div></section>
    <footer className="site-footer"><div className="shell footer-grid"><strong>VEXONYX</strong><p>AI platform for cybersecurity and authorized penetration testing.</p><nav><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/acceptable-use">Acceptable use</Link><Link href="/contact">Contact</Link></nav><span>© 2026 VEXONYX</span></div></footer>
  </main>;
}
