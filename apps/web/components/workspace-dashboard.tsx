import Link from "next/link";

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
  organizationId: string;
  readOnly?: boolean;
  createProjectAction?: (formData: FormData) => Promise<void>;
};

function MaybeLink({ readOnly, href, className, children }: { readOnly: boolean; href: string; className?: string; children: React.ReactNode }) {
  return readOnly ? <span className={className}>{children}</span> : <Link className={className} href={href}>{children}</Link>;
}

export function WorkspaceDashboard({ metrics, recentChats, recentProjects, planName, subscriptionStatus, creditBalance, lifetimeConsumed, integrationsCount, organizationId, readOnly = false, createProjectAction }: Props) {
  return <div className="app-content">
    <div className="app-heading"><div><h1>Security workspace</h1><p>Chats, projects, agents, evidence, billing, usage and integrations stay attached to the same organization and account history.</p></div><div style={{ display: "flex", gap: 10 }}><MaybeLink readOnly={readOnly} className="button button-small secondary" href="/app/billing">{planName}</MaybeLink><MaybeLink readOnly={readOnly} className="button button-small" href="/app/chat">New chat</MaybeLink></div></div>
    <section className="metric-grid">{metrics.map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong>{typeof value === "number" ? value.toLocaleString() : value}</strong></div>)}</section>
    <section className="workspace-grid">
      <article className="workspace-card"><header><h2>Recent chats</h2><MaybeLink readOnly={readOnly} href="/app/chat">View all →</MaybeLink></header>{recentChats.length ? recentChats.map((chat) => <MaybeLink readOnly={readOnly} className="project-row" href={`/app/chat/${chat.id}`} key={chat.id}><div><b>{chat.title}</b><small>{chat.status} · {new Date(chat.updated_at).toLocaleString("en-GB")}</small></div><span>Open →</span></MaybeLink>) : <div className="empty-state"><div><b>No chats yet.</b><p>Start a persistent VEXONYX conversation.</p></div></div>}</article>
      <article className="workspace-card"><header><h2>Recent projects</h2><MaybeLink readOnly={readOnly} href="/app/projects">View all →</MaybeLink></header>{recentProjects.length ? recentProjects.map((project) => <MaybeLink readOnly={readOnly} className="project-row" href={`/app/projects/${project.id}`} key={project.id}><div><b>{project.name}</b><small>{project.status}</small></div><span>Open →</span></MaybeLink>) : <div className="empty-state"><div><b>No projects yet.</b><p>Create your first authorized assessment.</p></div></div>}{!readOnly && createProjectAction ? <form className="workspace-form" action={createProjectAction}><input type="hidden" name="organization_id" value={organizationId} /><input name="name" required maxLength={160} placeholder="New project name" /><button className="button" type="submit">Create</button></form> : <div className="workspace-form"><input disabled placeholder="New project name" /><button className="button" disabled type="button">Create</button></div>}</article>
    </section>
    <section className="workspace-grid"><article className="workspace-card"><header><h2>Account</h2><MaybeLink readOnly={readOnly} href="/app/billing">Manage →</MaybeLink></header><div className="project-row"><div><b>Plan</b><small>{subscriptionStatus}</small></div><span>{planName === "Choose plan" ? "No paid plan" : planName}</span></div><div className="project-row"><div><b>Credit balance</b><small>{lifetimeConsumed.toLocaleString()} consumed lifetime</small></div><span>{creditBalance.toLocaleString()}</span></div><div className="project-row"><div><b>Connected integrations</b><small>Organization-scoped</small></div><span>{integrationsCount}</span></div></article><article className="workspace-card"><header><h2>Runtime status</h2><MaybeLink readOnly={readOnly} href="/app/agents">Agents →</MaybeLink></header><div className="empty-state"><div><b>Product workspace ready; external execution remains gated.</b><p>Chats, billing, credits, usage, connectors, authorization and agent state are wired before real GPU/model execution is enabled.</p></div></div></article></section>
  </div>;
}
