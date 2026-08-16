import { createOrganization } from "./actions";
import { getWorkspace } from "@/lib/workspace";
import { WorkspaceDashboard } from "@/components/workspace-dashboard";

export default async function DashboardPage() {
  const workspace = await getWorkspace();
  if (!workspace?.organizationId) return <div className="app-content"><div className="app-heading"><div><h1>Create your workspace.</h1><p>Set up a private workspace for your projects, chats, files, findings and reports.</p></div></div><section className="workspace-card"><form className="workspace-form" action={createOrganization}><input name="name" maxLength={120} required placeholder="Workspace name" /><button className="button" type="submit">Create workspace</button></form></section></div>;

  const { supabase, organizationId, userId } = workspace;
  const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0); const monthStart = month.toISOString().slice(0, 10);
  const [projects, findings, files, runs, reports, recentProjects, recentChats, subscription, credits, usage, integrations, profile] = await Promise.all([
    supabase.schema("app").from("projects").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null),
    supabase.schema("security").from("findings").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null),
    supabase.schema("artifacts").from("files").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).is("deleted_at", null),
    supabase.schema("ai").from("agent_runs").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.schema("reports").from("reports").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.schema("app").from("projects").select("id,name,status,updated_at").eq("organization_id", organizationId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(5),
    supabase.schema("app").from("conversations").select("id,title,status,updated_at").eq("organization_id", organizationId).eq("user_id", userId).neq("status", "deleted").order("updated_at", { ascending: false }).limit(5),
    supabase.schema("billing").from("subscriptions").select("status,current_period_end,plan_id,plans(name,code)").eq("organization_id", organizationId).maybeSingle(),
    supabase.schema("billing").from("credit_accounts").select("balance,lifetime_consumed").eq("organization_id", organizationId).maybeSingle(),
    supabase.schema("usage").from("usage_monthly").select("metric,quantity,cost").eq("organization_id", organizationId).eq("month_start", monthStart),
    supabase.schema("integrations").from("installations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "connected"),
    supabase.schema("app").from("profiles").select("display_name").eq("id", userId).maybeSingle(),
  ]);

  const sub = subscription.data as Record<string, unknown> | null;
  const plan = sub?.plans && typeof sub.plans === "object" ? sub.plans as Record<string, unknown> : null;
  const monthlyCost = (usage.data ?? []).reduce((sum, item) => sum + Number(item.cost ?? 0), 0);
  const metrics = [["Projects", projects.count ?? 0], ["Findings", findings.count ?? 0], ["Files", files.count ?? 0], ["Agent runs", runs.count ?? 0], ["Reports", reports.count ?? 0], ["Credits", Number(credits.data?.balance ?? 0)], ["Usage cost", `$${monthlyCost.toFixed(2)}`], ["Connectors", integrations.count ?? 0]] as const;

  return <WorkspaceDashboard
    metrics={metrics}
    recentChats={recentChats.data ?? []}
    recentProjects={recentProjects.data ?? []}
    planName={String(plan?.name || "Choose plan")}
    subscriptionStatus={String(sub?.status || "inactive")}
    creditBalance={Number(credits.data?.balance ?? 0)}
    lifetimeConsumed={Number(credits.data?.lifetime_consumed ?? 0)}
    integrationsCount={integrations.count ?? 0}
    displayName={profile.data?.display_name ?? null}
  />;
}
