import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Section = {
  title:string;
  description:string;
  schema:string;
  table:string;
  fields:string[];
  order?:string;
};

const sections: Record<string,Section> = {
  users:{title:"Users",description:"Profiles with access to VEXONYX.",schema:"app",table:"profiles",fields:["display_name","is_superadmin","created_at"],order:"created_at"},
  organizations:{title:"Organizations",description:"Customer workspaces and their current access state.",schema:"app",table:"organizations",fields:["name","slug","status","created_at"],order:"created_at"},
  waitlist:{title:"Waitlist",description:"Private beta interest, verification and invitation state.",schema:"launch",table:"waitlist_entries",fields:["email","company","source","status","created_at"],order:"created_at"},
  models:{title:"Models",description:"Internal model aliases. No real model is enabled until revision, license and evaluation checks pass.",schema:"ai",table:"models",fields:["alias","role","enabled","updated_at"],order:"updated_at"},
  inference:{title:"AI requests",description:"Generation requests are tracked before any private GPU endpoint becomes active.",schema:"ai",table:"generation_requests",fields:["requested_role","status","priority","input_tokens","output_tokens","cost","created_at"],order:"created_at"},
  deployments:{title:"AI deployments",description:"Deployment inventory remains empty or disabled before the GPU rollout.",schema:"ai",table:"model_deployments",fields:["environment","gpu_provider","gpu_type","status","last_health_at","updated_at"],order:"updated_at"},
  jobs:{title:"Jobs",description:"Queued work, attempts and lease state across background processing.",schema:"operations",table:"jobs",fields:["queue_name","priority","status","attempt_count","available_at","updated_at"],order:"updated_at"},
  usage:{title:"Usage",description:"Monthly organization usage and cost aggregates.",schema:"usage",table:"usage_monthly",fields:["organization_id","month_start","metric","quantity","cost","updated_at"],order:"updated_at"},
  security:{title:"Approvals",description:"Human approvals required before configured sensitive actions can continue.",schema:"security",table:"approval_requests",fields:["operation_type","status","requested_at","reviewed_at","expires_at"],order:"requested_at"},
  audit:{title:"Audit",description:"Append-oriented history for important security and administration actions.",schema:"audit",table:"audit_logs",fields:["actor_type","action","resource_type","request_id","created_at"],order:"created_at"},
  system:{title:"Platform",description:"Emergency platform state. Normal workspace permissions cannot change these controls.",schema:"operations",table:"system_state",fields:["incident_mode","agents_enabled","external_tools_enabled","sandbox_scheduling_enabled","external_network_enabled","updated_at"]},
  "feature-flags":{title:"Feature flags",description:"Controlled rollout switches for beta capabilities.",schema:"operations",table:"feature_flags",fields:["key","scope_type","enabled","updated_at"],order:"updated_at"},
};

const nav = ["users","organizations","waitlist","models","inference","deployments","jobs","usage","security","audit","system","feature-flags"] as const;

function display(value:unknown) {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "enabled" : "disabled";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replaceAll("_", " ");
}

export default async function AdminSectionPage({params}:{params:Promise<{section:string}>}) {
  const {section} = await params;
  const config = sections[section];
  if (!config) notFound();

  const client = await createClient();
  const {data:claims} = await client.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");
  const {data:profile} = await client.schema("app").from("profiles").select("is_superadmin").eq("id",userId).single();
  if (!profile?.is_superadmin) notFound();

  const admin = createAdminClient();
  let rows:Array<Record<string,unknown>> = [];
  let count = 0;
  let loadError = false;
  if (admin) {
    let query = admin.schema(config.schema).from(config.table).select("*",{count:"exact"}).limit(50);
    if (config.order) query = query.order(config.order,{ascending:false});
    const result = await query;
    rows = (result.data ?? []) as Array<Record<string,unknown>>;
    count = result.count ?? rows.length;
    loadError = Boolean(result.error);
  }

  return <main className="content-page">
    <div className="shell" style={{paddingTop:28,display:"flex",alignItems:"center",justifyContent:"space-between",gap:20}}><Brand/><Link href="/admin">Admin overview</Link></div>
    <section className="shell content-hero"><div className="section-label">SUPERADMIN</div><h1>{config.title}</h1><p>{config.description}</p></section>
    <section className="shell" style={{paddingBottom:100}}>
      <nav style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20}} aria-label="Admin sections">{nav.map((item)=><Link className={item===section?"button button-small":"button button-small secondary"} href={`/admin/${item}`} key={item}>{sections[item].title}</Link>)}</nav>
      <article className="workspace-card"><header><h2>{config.title}</h2><span>{count} records</span></header>
        {!admin ? <div className="empty-state"><div><b>Privileged server access is not configured.</b><p>Protected administration data remains unavailable.</p></div></div> : loadError ? <div className="empty-state"><div><b>This section could not be loaded.</b><p>No records were changed.</p></div></div> : rows.length ? rows.map((row,index)=><div className="project-row" key={String(row.id ?? `${section}-${index}`)}><div><b>{display(row[config.fields[0]])}</b><small>{config.fields.slice(1,Math.max(2,config.fields.length-1)).map((field)=>`${field.replaceAll("_"," ")}: ${display(row[field])}`).join(" · ")}</small></div><span>{display(row[config.fields.at(-1) ?? config.fields[0]])}</span></div>) : <div className="empty-state"><div><b>No records yet.</b><p>This is expected before the corresponding beta capability is used.</p></div></div>}
      </article>
    </section>
  </main>;
}
