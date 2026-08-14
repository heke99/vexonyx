"use client";

import { useEffect, useState } from "react";
import styles from "./hero-workspace.module.css";

const steps = [
  "Mapping exposed surface",
  "Reviewing observed services",
  "Correlating potential weaknesses",
  "Validating findings",
  "Preparing evidence",
] as const;

const evidence = [
  ["REQUEST", "Auth flow sample"],
  ["CONFIG", "Session policy"],
  ["OBSERVATION", "State mismatch"],
] as const;

export function HeroWorkspace() {
  const [active, setActive] = useState(2);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((current) => (current >= steps.length - 1 ? 1 : current + 1));
    }, 1700);
    return () => window.clearInterval(timer);
  }, []);

  const validated = active >= 3;

  return (
    <div className={styles.frame} aria-label="Synthetic VEXONYX security assessment workspace">
      <div className={styles.topbar}>
        <div className={styles.dots}><i /><i /><i /></div>
        <span>███████ Security Assessment</span>
        <span className={styles.demo}><i /> example workspace</span>
      </div>

      <div className={styles.body}>
        <aside className={styles.side}>
          <div className={styles.sideBrand}><span className={styles.sideMark} /> VEXONYX</div>
          <span className={styles.navLabel}>PROJECT</span>
          {[
            ["Overview", ""],
            ["Scope", ""],
            ["Agent", "active"],
            ["Findings", "4"],
            ["Evidence", "3"],
            ["Files", "12"],
            ["Notes", ""],
            ["Reports", "1"],
          ].map(([label, badge]) => (
            <div className={`${styles.navItem} ${badge === "active" ? styles.navItemActive : ""}`} key={label}>
              <span>{label}</span>{badge && badge !== "active" ? <b>{badge}</b> : null}
            </div>
          ))}
        </aside>

        <section className={styles.main}>
          <div className={styles.crumb}><span>Projects</span><span>/</span><strong>Security Assessment</strong></div>
          <div className={styles.headingRow}>
            <div>
              <h3>Authorized assessment in progress</h3>
              <p>Project context, evidence and review stay connected throughout the engagement.</p>
            </div>
            <span className={styles.scopePill}>SCOPE VERIFIED</span>
          </div>

          <article className={styles.agentCard}>
            <header className={styles.agentHeader}>
              <span>VEXONYX AGENT</span>
              <span className={styles.running}><i /> analyzing</span>
            </header>
            <p className={styles.agentTitle}>Finding vulnerabilities on <span className={styles.redacted}>█████████████</span></p>
            <div className={styles.steps}>
              {steps.map((step, index) => {
                const state = index < active ? "done" : index === active ? "active" : "pending";
                return (
                  <div className={`${styles.step} ${state === "done" ? styles.stepDone : state === "active" ? styles.stepActive : ""}`} key={step}>
                    <span className={styles.stepIcon}>{state === "done" ? "✓" : state === "active" ? "●" : "○"}</span>
                    <span>{step}</span>
                    <small>{state === "done" ? "complete" : state === "active" ? "running" : "queued"}</small>
                  </div>
                );
              })}
            </div>
            <div className={styles.activity}><b>→</b><span>{validated ? "evidence linked to potential finding" : "correlating observed behavior"}</span><time>now</time></div>
          </article>

          <div className={styles.evidenceRail}>
            {evidence.map(([kind, name], index) => <div className={styles.evidence} key={kind}><span>{kind}</span><strong>{validated || index === 0 ? name : "Preparing…"}</strong></div>)}
          </div>
          <p className={styles.mobileHint}>The finding panel appears beside the assessment on wider screens.</p>
        </section>

        <aside className={styles.right}>
          <div className={styles.rightTitle}><span>Potential findings</span><strong>{validated ? 4 : 3}</strong></div>
          <div className={styles.severityGrid}>
            {[['Critical','0'],['High',validated ? '1' : '0'],['Medium','2'],['Low','1']].map(([label, value]) => <div className={styles.severity} key={label}><span>{label}</span><b>{value}</b></div>)}
          </div>

          <article className={`${styles.finding} ${validated ? styles.findingLive : styles.findingDim}`}>
            <div className={styles.findingMeta}><span className={styles.high}>HIGH</span><span className={styles.confidence}>92% confidence</span></div>
            <h4>Authentication state inconsistency</h4>
            <p>Observed behavior differs across authenticated state transitions. Supporting artifacts are linked for review.</p>
            <footer className={styles.findingFooter}><span>{validated ? "Validated" : "Reviewing"}</span><span>{validated ? "3 artifacts" : "1 artifact"}</span></footer>
          </article>

          <div className={styles.timeline}>
            <span className={styles.timelineLabel}>RECENT ACTIVITY</span>
            <div className={styles.event}><strong>Project context loaded</strong><span>Scope and authorization checked</span></div>
            <div className={styles.event}><strong>Potential weakness identified</strong><span>Evidence correlation started</span></div>
            <div className={`${styles.event} ${validated ? styles.eventLive : ""}`}><strong>{validated ? "Finding validated" : "Validation running"}</strong><span>{validated ? "Evidence ready for review" : "Comparing observations"}</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
