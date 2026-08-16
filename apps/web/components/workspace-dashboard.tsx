import Link from "next/link";
import styles from "./customer-app.module.css";

export type DashboardMetric = readonly [string, string | number];
export type DashboardChat = { id: string; title: string; status: string; updated_at: string };
export type DashboardProject = { id: string; name: string; status: string };

type Props = {
  metrics: readonly DashboardMetric[];
  recentChats: DashboardChat[];
  recentProjects: DashboardProject[];
  planName: string;
  subscriptionStatus: string;
  creditBalance: number;
  lifetimeConsumed: number;
  integrationsCount: number;
  displayName?: string | null;
  readOnly?: boolean;
};

function MaybeLink({ readOnly, href, className, children }: { readOnly: boolean; href: string; className?: string; children: React.ReactNode }) {
  return readOnly ? <span className={className}>{children}</span> : <Link className={className} href={href}>{children}</Link>;
}

export function WorkspaceDashboard({ metrics, recentChats, recentProjects, planName, subscriptionStatus, creditBalance, lifetimeConsumed, integrationsCount, displayName, readOnly = false }: Props) {
  const value = (label: string) => metrics.find(([name]) => name === label)?.[1] ?? 0;
  const firstName = String(displayName || "there").trim().split(/\s+/)[0] || "there";
  const quickActions = [
    ["/app/chat", "✦", "Start a chat", "Ask VEXONYX to investigate or explain"],
    ["/app/projects", "◇", "New assessment", "Create an authorized security project"],
    ["/app/files", "▤", "Analyze files", "Add source, evidence or assessment material"],
    ["/app/findings", "△", "Review findings", "Prioritize and work through security findings"],
  ] as const;

  return <div className={styles.dashboard}>
    <section className={styles.welcome}>
      <div className={styles.welcomeCopy}>
        <div className={styles.eyebrow}>YOUR WORKSPACE</div>
        <h1>Welcome back, {firstName}.</h1>
        <p>Chat with your security agents, continue assessments and keep your evidence, findings and reports in one place.</p>
      </div>
      <div className={styles.accountPill}><b>{planName === "Choose plan" ? "Free workspace" : planName}</b><span>{creditBalance.toLocaleString()} credits available</span></div>
    </section>

    <section className={styles.promptCard} aria-label="Start with VEXONYX">
      <div className={styles.promptLabel}>What do you want VEXONYX to work on?</div>
      <MaybeLink readOnly={readOnly} href="/app/chat" className={readOnly ? styles.promptBoxDisabled : styles.promptBox}>
        <span className={styles.promptPlaceholder}>Ask about a target, upload context, review code, investigate a finding…</span>
        <span className={styles.sendButton}>→</span>
      </MaybeLink>
    </section>

    <section className={styles.quickGrid} aria-label="Quick actions">
      {quickActions.map(([href,icon,title,description]) => <MaybeLink key={href} readOnly={readOnly} href={href} className={readOnly ? styles.quickCardDisabled : styles.quickCard}>
        <span className={styles.quickIcon}>{icon}</span><b>{title}</b><span>{description}</span>
      </MaybeLink>)}
    </section>

    <section className={styles.summaryGrid} aria-label="Workspace summary">
      <div className={styles.summaryCard}><span>Credits</span><strong>{creditBalance.toLocaleString()}</strong></div>
      <div className={styles.summaryCard}><span>Projects</span><strong>{Number(value("Projects")).toLocaleString()}</strong></div>
      <div className={styles.summaryCard}><span>Agent runs</span><strong>{Number(value("Agent runs")).toLocaleString()}</strong></div>
      <div className={styles.summaryCard}><span>Findings</span><strong>{Number(value("Findings")).toLocaleString()}</strong></div>
    </section>

    <section className={styles.sectionGrid}>
      <article className={styles.panel}>
        <header className={styles.panelHeader}><h2>Recent chats</h2><MaybeLink readOnly={readOnly} href="/app/chat">View all →</MaybeLink></header>
        {recentChats.length ? recentChats.map((chat) => <MaybeLink readOnly={readOnly} className={readOnly ? styles.rowDisabled : styles.row} href={`/app/chat/${chat.id}`} key={chat.id}>
          <span className={styles.rowText}><b>{chat.title}</b><small>{chat.status} · {new Date(chat.updated_at).toLocaleString("en-GB")}</small></span><span className={styles.rowMeta}>Open →</span>
        </MaybeLink>) : <div className={styles.empty}>No chats yet. Start a conversation and it will appear here.</div>}
      </article>

      <article className={styles.panel}>
        <header className={styles.panelHeader}><h2>Your account</h2><MaybeLink readOnly={readOnly} href="/app/billing">Manage →</MaybeLink></header>
        <div className={styles.accountList}>
          <div className={styles.accountLine}><div><b>Plan</b><small>{subscriptionStatus}</small></div><strong>{planName === "Choose plan" ? "No paid plan" : planName}</strong></div>
          <div className={styles.accountLine}><div><b>Credits</b><small>{lifetimeConsumed.toLocaleString()} used over time</small></div><strong>{creditBalance.toLocaleString()}</strong></div>
          <div className={styles.accountLine}><div><b>Connected tools</b><small>GitHub and other integrations</small></div><strong>{integrationsCount}</strong></div>
          <div className={styles.accountLine}><div><b>Usage this month</b><small>Estimated model and agent usage</small></div><strong>{String(value("Usage cost"))}</strong></div>
        </div>
      </article>
    </section>

    <div className={styles.sectionTitle}>RECENT WORK</div>
    <section className={styles.activityGrid}>
      {recentProjects.length ? recentProjects.slice(0,3).map((project) => <MaybeLink readOnly={readOnly} className={styles.activityCard} href={`/app/projects/${project.id}`} key={project.id}>
        <span>{project.status}</span><b>{project.name}</b><p>Open the assessment to continue chats, files, agents, findings and reporting.</p>
      </MaybeLink>) : <div className={styles.activityCard}><span>GET STARTED</span><b>Create your first assessment</b><p>Projects keep scope, evidence, conversations and findings together.</p></div>}
    </section>
  </div>;
}
