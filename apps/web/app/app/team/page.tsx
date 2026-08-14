import { getWorkspace } from "@/lib/workspace";

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const { data: members, error } = await ws.supabase.schema("app").from("organization_members").select("user_id,role,created_at").eq("organization_id", ws.organizationId).order("created_at", { ascending: true });
  const ids = members?.map((member) => member.user_id) ?? [];
  const { data: profiles } = ids.length ? await ws.supabase.schema("app").from("profiles").select("id,display_name").in("id", ids) : { data: [] as Array<{id:string;display_name:string|null}> };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  const owners = members?.filter((member) => ["organization_owner","owner"].includes(String(member.role))).length ?? 0;
  const admins = members?.filter((member) => ["organization_admin","admin"].includes(String(member.role))).length ?? 0;

  return <div className="app-content">
    <div className="app-heading"><div><h1>Team</h1><p>See who can access this organization and the role each person has.</p></div></div>
    <section className="metric-grid"><div className="metric"><span>Members</span><strong>{members?.length ?? 0}</strong></div><div className="metric"><span>Owners</span><strong>{owners}</strong></div><div className="metric"><span>Admins</span><strong>{admins}</strong></div></section>
    <section className="workspace-card"><header><h2>Organization members</h2><span>Access is enforced on every protected project resource</span></header>
      {error ? <div className="empty-state"><div><b>Team members could not be loaded.</b><p>Try again. Access permissions have not changed.</p></div></div> : members?.length ? members.map((member) => <div className="project-row" key={member.user_id}><div><b>{member.user_id === ws.userId ? "You" : names.get(member.user_id) || "Team member"}</b><small>Joined {new Date(member.created_at).toLocaleDateString("en-GB")}</small></div><span>{String(member.role).replaceAll("organization_", "").replaceAll("_", " ")}</span></div>) : <div className="empty-state"><div><b>No members found.</b><p>Your organization needs at least one owner before work can continue.</p></div></div>}
    </section>
  </div>;
}
