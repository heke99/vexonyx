"use client";

import { useEffect, useState } from "react";

const steps = [
  "Mapping exposed surface",
  "Reviewing observed services",
  "Correlating potential weaknesses",
  "Validating findings",
  "Preparing evidence",
];

export function HeroWorkspace() {
  const [active, setActive] = useState(2);
  useEffect(() => {
    const timer = window.setInterval(() => setActive((current) => (current + 1) % steps.length), 1600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="product-frame" aria-label="Synthetic VEXONYX product demonstration">
      <div className="frame-bar"><div className="frame-dots"><i /><i /><i /></div><span>Project / ███████ Security Assessment</span><span className="live-pill"><i /> synthetic demo</span></div>
      <div className="frame-grid">
        <aside className="mini-sidebar">
          <b>VEXONYX</b><span>Overview</span><span>Targets</span><span className="selected">Agent</span><span>Findings <em>4</em></span><span>Evidence</span><span>Files</span><span>Notes</span><span>Reports</span>
        </aside>
        <section className="agent-panel">
          <div className="eyebrow">VEXONYX AGENT</div>
          <h3>Finding vulnerabilities on <span className="redacted">█████████████</span></h3>
          <div className="agent-status"><span className="pulse" /> Analyzing application context…</div>
          <div className="steps">{steps.map((step, index) => <div className={index === active ? "step active" : index < active ? "step done" : "step"} key={step}><span>{index < active ? "✓" : index === active ? "●" : "○"}</span>{step}</div>)}</div>
          <div className="activity-line"><code>→</code> correlated observed behavior <span>now</span></div>
        </section>
        <aside className="finding-panel">
          <div className="finding-head"><span>Potential findings</span><strong>4</strong></div>
          <div className="severity-row"><span>Critical</span><b>0</b></div><div className="severity-row"><span>High</span><b>1</b></div><div className="severity-row"><span>Medium</span><b>2</b></div><div className="severity-row"><span>Low</span><b>1</b></div>
          <article className={active >= 3 ? "finding-card reveal" : "finding-card"}><div><span className="severity-badge">HIGH</span><span className="confidence">92% confidence</span></div><h4>Authentication state inconsistency</h4><p>3 evidence artifacts</p><footer><span>Validated</span><span>Evidence linked</span></footer></article>
        </aside>
      </div>
    </div>
  );
}
