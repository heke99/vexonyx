import Link from "next/link";
import { createOrganization, createProject } from "./actions";
import { getWorkspace } from "@/lib/workspace";

export default async function DashboardPage() {
  const workspace = await getWorkspace();
  if (!workspace?.organizationId) return <div className="app-content"><div className="app-heading"><div><h1>Create your organization.</h1><p>Your organization keeps projects, files, findings, activity, billing and usage separated from every other workspace.</p></div></div><section className="workspace-card"><form className="workspace-form" action={createOrganization}><input name="name" maxLength={120} required placeholder="Organization name" /><button className="button" type="submit">Create organization</button></form></section></div>;

  const { supabase, organizationId, userId } = workspace;
  const month = new Date(); month.setUTCDate(1); month.setUTCHours(0,0,0,0); const monthStart=month.toISOString().slice(0,10);
  const [projects, findings, files, runs, reports, recentProjects, recentChats, subscription, credits, usage, integrations] = await Promise.all([
    supabase.schema("app").from("projects").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null),
    supabase.schema("security").from("findings").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null),
    supabase.schema("artifacts").from("files").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null),
    supabase.schema("ai").from("agent_runs").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.schema("reports").from("reports").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.schema("app").from("projects").select("id,name,status,updated_at").eq("organization_id", organizationId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(5),
    supabase.schema("app").from("conversations").select("id,title,status,updated_at").eq("organization_id",organizationId).eq("user_id",userId).neq("status","deleted").order("updated_at",{ascending:false}).limit(5),
    supabase.schema("billing").from("subscriptions").select("status,current_period_end,plan_id,plans(name,code)").eq("organization_id",organizationId).maybeSingle(),
    supabase.schema("billing").from("credit_accounts").select("balance,lifetime_consumed").eq("organization_id",organizationId).maybeSingle(),
    supabase.schema("usage").from("usage_monthly").select("metric,quantity,cost").eq("organization_id",organizationId).eq("month_start",monthStart),
    supabase.schema("integrations").from("installations").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("status","connected"),
  ]);

  const sub=subscription.data as Record<string,unknown>|null; const plan=sub?.plans&&typeof sub.plans==="object"?sub.plans as Record<string,unknown>:null; const monthlyCost=(usage.data??[]).reduce((s,x)=>s+Number(x.cost??0),0);
  const metrics = [["Projects", projects.count ?? 0],["Findings", findings.count ?? 0],["Files", files.count ?? 0],["Agent runs", runs.count ?? 0],["Reports", reports.count ?? 0],["Credits", Number(credits.data?.balance??0)],["Usage cost", `$${monthlyCost.toFixed(2)}`],["Connectors", integrations.count??0]] as const;

  return <div className="app-content">
    <div className="app-heading"><div><h1>Security workspace</h1><p>Chats, projects, agents, evidence, billing, usage and integrations stay attached to the same organization and account history.</p></div><div style={{display:"flex",gap:10}}><Link className="button button-small secondary" href="/app/billing">{String(plan?.name||"Choose plan")}</Link><Link className="button button-small" href="/app/chat">New chat</Link></div></div>
    <section className="metric-grid">{metrics.map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{typeof value==="number"?value.toLocaleString():value}</strong></div>)}</section>
    <section className="workspace-grid">
      <article className="workspace-card"><header><h2>Recent chats</h2><Link href="/app/chat">View all →</Link></header>{recentChats.data?.length?recentChats.data.map(c=><Link className="project-row" href={`/app/chat/${c.id}`} key={c.id}><div><b>{c.title}</b><small>{c.status} · {new Date(c.updated_at).toLocaleString("en-GB")}</small></div><span>Open →</span></Link>):<div className="empty-state"><div><b>No chats yet.</b><p>Start a persistent VEXONYX conversation.</p></div></div>}</article>
      <article className="workspace-card"><header><h2>Recent projects</h2><Link href="/app/projects">View all →</Link></header>{recentProjects.data?.length ? recentProjects.data.map((project)=><Link className="project-row" href={`/app/projects/${project.id}`} key={project.id}><div><b>{project.name}</b><small>{project.status}</small></div><span>Open →</span></Link>) : <div className="empty-state"><div><b>No projects yet.</b><p>Create your first authorized assessment.</p></div></div>}<form className="workspace-form" action={createProject}><input type="hidden" name="organization_id" value={organizationId}/><input name="name" required maxLength={160} placeholder="New project name"/><button className="button" type="submit">Create</button></form></article>
    </section>
    <section className="workspace-grid"><article className="workspace-card"><header><h2>Account</h2><Link href="/app/billing">Manage →</Link></header><div className="project-row"><div><b>Plan</b><small>{String(sub?.status||"inactive")}</small></div><span>{String(plan?.name||"No paid plan")}</span></div><div className="project-row"><div><b>Credit balance</b><small>{Number(credits.data?.lifetime_consumed??0).toLocaleString()} consumed lifetime</small></div><span>{Number(credits.data?.balance??0).toLocaleString()}</span></div><div className="project-row"><div><b>Connected integrations</b><small>Organization-scoped</small></div><span>{integrations.count??0}</span></div></article><article className="workspace-card"><header><h2>Runtime status</h2><Link href="/app/agents">Agents →</Link></header><div className="empty-state"><div><b>Product workspace ready; external execution remains gated.</b><p>Chats, billing, credits, usage, connectors, authorization and agent state are wired before real GPU/model execution is enabled.</p></div></div></article></section>
  </div>;
}
