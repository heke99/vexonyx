import styles from "./hero-attack-surface.module.css";

const terminalLines = [
  "$ vexonyx assess https://acme-app.com",
  "[+] Authorization verified",
  "[+] Mapping public attack surface",
  "[+] 24 subdomains discovered",
  "[+] 124 endpoints indexed",
  "[+] Reviewing exposed services",
  "[✓] Evidence capture enabled",
];

const nodes = [
  { label: "api.acme-app.com", short: "{}", className: styles.api },
  { label: "auth.acme-app.com", short: "LOCK", className: styles.auth },
  { label: "admin.acme-app.com", short: "ADM", className: styles.admin },
  { label: "cloud storage", short: "S3", className: styles.cloud },
  { label: "source repository", short: "GIT", className: styles.repo },
  { label: "database", short: "DB", className: styles.database },
] as const;

export function HeroAttackSurface() {
  return (
    <div className={styles.frame} aria-label="Synthetic VEXONYX attack surface example">
      <div className={styles.header}>
        <span>ATTACK SURFACE MAP</span>
        <span className={styles.synthetic}>SYNTHETIC EXAMPLE</span>
      </div>

      <div className={styles.content}>
        <div className={styles.terminal}>
          {terminalLines.map((line, index) => (
            <div key={line} className={index === 0 ? styles.command : undefined}>{line}</div>
          ))}
        </div>

        <div className={styles.map} aria-hidden="true">
          <svg className={styles.links} viewBox="0 0 640 360" preserveAspectRatio="none">
            <line x1="320" y1="180" x2="173" y2="66" />
            <line x1="320" y1="180" x2="135" y2="174" />
            <line x1="320" y1="180" x2="225" y2="294" />
            <line x1="320" y1="180" x2="487" y2="62" />
            <line x1="320" y1="180" x2="523" y2="200" />
            <line x1="320" y1="180" x2="456" y2="302" />
            <circle cx="320" cy="180" r="96" />
            <circle cx="320" cy="180" r="132" />
          </svg>

          <div className={styles.core}>
            <span className={styles.coreIcon}>◎</span>
            <strong>acme-app.com</strong>
            <small>authorized target</small>
          </div>

          {nodes.map((node) => (
            <div className={`${styles.node} ${node.className}`} key={node.label}>
              <span>{node.short}</span>
              <small>{node.label}</small>
            </div>
          ))}
        </div>

        <div className={styles.authorized}>
          <span className={styles.shield}>✓</span>
          <strong>AUTHORIZED</strong>
          <p>Professional assessments with explicit permission.</p>
          <span className={styles.policy}>Scope checked before active work</span>
        </div>
      </div>
    </div>
  );
}
