"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./hero-workspace.module.css";

type Scenario = {
  label: string;
  project: string;
  task: string;
  steps: readonly string[];
  evidence: readonly (readonly [string, string])[];
  finding: string;
  findingBody: string;
  severity: "HIGH" | "MEDIUM";
  confidence: string;
  activity: string;
};

const scenarios: readonly Scenario[] = [
  {
    label: "WEB APPLICATION",
    project: "Customer Portal Review",
    task: "Reviewing authentication behavior on █████████████",
    steps: ["Mapping public attack surface", "Reviewing authentication flows", "Correlating session behavior", "Validating the finding", "Preparing evidence"],
    evidence: [["REQUEST", "Password reset flow"], ["RESPONSE", "Session state comparison"], ["OBSERVATION", "Unexpected session persistence"]],
    finding: "Session remains active after credential reset",
    findingBody: "Observed sessions remain valid after a password reset. Supporting request and response evidence is linked for review.",
    severity: "HIGH",
    confidence: "94% confidence",
    activity: "session behavior reproduced and linked to evidence",
  },
  {
    label: "CLOUD REVIEW",
    project: "Cloud Access Review",
    task: "Reviewing workload permissions in ███████████",
    steps: ["Loading cloud inventory", "Mapping workload identities", "Reviewing permission boundaries", "Validating effective access", "Preparing remediation notes"],
    evidence: [["POLICY", "Workload role definition"], ["RESOURCE", "Effective permission set"], ["OBSERVATION", "Broader access than required"]],
    finding: "Workload identity has excessive permissions",
    findingBody: "The observed workload role can access resources outside its expected operational boundary. Evidence is preserved for review.",
    severity: "MEDIUM",
    confidence: "91% confidence",
    activity: "effective access compared with expected workload boundary",
  },
  {
    label: "CODE REVIEW",
    project: "API Service Review",
    task: "Reviewing sensitive data handling in ███████████",
    steps: ["Indexing repository context", "Tracing authentication code", "Reviewing debug and error paths", "Validating exposure conditions", "Preparing source references"],
    evidence: [["SOURCE", "Authentication handler"], ["SOURCE", "Debug logging path"], ["OBSERVATION", "Sensitive value reaches logs"]],
    finding: "Sensitive token can reach application logs",
    findingBody: "A debug path can write a sensitive token to logs under specific error conditions. Source references are attached for validation.",
    severity: "HIGH",
    confidence: "96% confidence",
    activity: "source path traced from request handling to logging sink",
  },
];

const fallbackScenario = scenarios[0]!;

export function HeroWorkspace() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [active, setActive] = useState(2);
  const scenario = scenarios[scenarioIndex] ?? fallbackScenario;

  useEffect(() => {
    const stepTimer = window.setInterval(() => {
      setActive((current) => (current >= scenario.steps.length - 1 ? 1 : current + 1));
    }, 1700);
    return () => window.clearInterval(stepTimer);
  }, [scenario.steps.length]);

  useEffect(() => {
    const scenarioTimer = window.setInterval(() => {
      setScenarioIndex((current) => (current + 1) % scenarios.length);
      setActive(1);
    }, 8500);
    return () => window.clearInterval(scenarioTimer);
  }, []);

  const validated = active >= 3;
  const findingCount = validated ? 4 : 3;
  const scenarioNumber = String(scenarioIndex + 1).padStart(2, "0");
  const severityGrid = useMemo(() => scenario.severity === "HIGH"
    ? [["Critical", "0"], ["High", validated ? "1" : "0"], ["Medium", "2"], ["Low", "1"]]
    : [["Critical", "0"], ["High", "0"], ["Medium", validated ? "2" : "1"], ["Low", "1"]], [scenario.severity, validated]);

  return (
    <div className={styles.frame} aria-label={`Synthetic VEXONYX example: ${scenario.label.toLowerCase()}`}>
      <div className={styles.topbar}>
        <div className={styles.dots}><i /><i /><i /></div>
        <span>EXAMPLE {scenarioNumber}/{String(scenarios.length).padStart(2, "0")} · {scenario.label}</span>
        <span className={styles.demo}><i /> synthetic data</span>
      </div>

      <div className={styles.body}>
        <aside className={styles.side}>
          <div className={styles.sideBrand}><span className={styles.sideMark} /> VEXONYX</div>
          <span className={styles.navLabel}>PROJECT</span>
          {[
            ["Overview", ""], ["Scope", ""], ["Agent", "active"], ["Findings", String(findingCount)],
            ["Evidence", "3"], ["Files", "12"], ["Notes", ""], ["Reports", "1"],
          ].map(([label, badge]) => (
            <div className={`${styles.navItem} ${badge === "active" ? styles.navItemActive : ""}`} key={label}>
              <span>{label}</span>{badge && badge !== "active" ? <b>{badge}</b> : null}
            </div>
          ))}
          <span className={styles.navLabel} style={{ marginTop: 20 }}>EXAMPLES</span>
          {scenarios.map((item, index) => (
            <button
              type="button"
              key={item.label}
              onClick={() => { setScenarioIndex(index); setActive(1); }}
              aria-pressed={scenarioIndex === index}
              style={{
                appearance: "none",
                border: 0,
                background: scenarioIndex === index ? "rgba(216,255,85,.08)" : "transparent",
                color: scenarioIndex === index ? "#e9f8ba" : "#707984",
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 7,
                cursor: "pointer",
                fontSize: 9,
                letterSpacing: ".04em",
              }}
            >{item.label}</button>
          ))}
        </aside>

        <section className={styles.main}>
          <div className={styles.crumb}><span>Projects</span><span>/</span><strong>{scenario.project}</strong></div>
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
            <p className={styles.agentTitle}>{scenario.task}</p>
            <div className={styles.steps}>
              {scenario.steps.map((step, index) => {
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
            <div className={styles.activity}><b>→</b><span>{validated ? scenario.activity : "correlating observations"}</span><time>now</time></div>
          </article>

          <div className={styles.evidenceRail}>
            {scenario.evidence.map(([kind, name], index) => (
              <div className={styles.evidence} key={`${kind}-${name}`}>
                <span>{kind}</span><strong>{validated || index === 0 ? name : "Preparing…"}</strong>
              </div>
            ))}
          </div>
          <p className={styles.mobileHint}>Three synthetic examples rotate automatically. Choose one from the example list on wider screens.</p>
        </section>

        <aside className={styles.right}>
          <div className={styles.rightTitle}><span>Potential findings</span><strong>{findingCount}</strong></div>
          <div className={styles.severityGrid}>
            {severityGrid.map(([label, value]) => <div className={styles.severity} key={label}><span>{label}</span><b>{value}</b></div>)}
          </div>

          <article className={`${styles.finding} ${validated ? styles.findingLive : styles.findingDim}`}>
            <div className={styles.findingMeta}><span className={styles.high}>{scenario.severity}</span><span className={styles.confidence}>{scenario.confidence}</span></div>
            <h4>{scenario.finding}</h4>
            <p>{scenario.findingBody}</p>
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
