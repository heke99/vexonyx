import { InvitationForm } from "@/components/invitation-form";
import { getWorkspace } from "@/lib/workspace";
import { revokeInvitation } from "./actions";

export default async function Page() {
  const ws = await getWorkspace();
  if (!ws?.organizationId) return <div className="app-content"><div className="empty-state"><b>Create an organization first.</b></div></div>;

  const isAdmin = ws.role === "organization_owner" || ws.role === "organization_admin";
  const [{ data: members, error }, invitationsResult] = await Promise.all([
    ws.supabase.schema("app").from("organization_members").select("user_id,role,created_at").eq("organization_id", ws.organizationId).order("created_at", { ascending: true }),
    isAdmin ? ws.supabase.schema("app").from("organization_invitations").select("id,email_normalized,role,status,expires_at,created_at,accepted_at").eq("organization_id",ws.organizationId).order("created_at",{ascending:false}).limit(50) : Promise.resolve({data:[],error:null}),
  ]);
  const ids = members?.map((member) => member.user_id) ?? [];
  const { data: profiles } = ids.length ? await ws.supabase.schema("app").from("profiles").select("id,display_name").in("id", ids) : { data: [] as Array<{id:string;display_name:string|null}> };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  const owners = members?.filter((member) => member.role === "organization_owner").length ?? 0;
  const admins = members?.filter((member) => member.role === "organization_admin").length ?? 0;
  const invitations = invitationsResult.data ?? [];
  const pendingInvites = invitations.filter((invitation)=>invitation.status === "pending" && new Date(invitation.expires_at) > new Date()).length;

  return <div className="app-content">
    <div className="app-heading"><div><h1>Team</h1><p>Manage who can access this organization and the role each person has.</p></div></div>
    <section className="metric-grid"><div className="metric"><span>Members</span><strong>{members?.length ?? 0}</strong></div><div className="metric"><span>Owners</span><strong>{owners}</strong></div><div className="metric"><span>Admins</span><strong>{admins}</strong></div>{isAdmin?<div className="metric"><span>Pending invites</span><strong>{pendingInvites}</strong></div>:null}</section>
    <section className="workspace-grid">
      <article className="workspace-card"><header><h2>Organization members</h2><span>Access enforced server-side</span></header>
        {error ? <div className="empty-state"><div><b>Team members could not be loaded.</b><p>Try again. Access permissions have not changed.</p></div></div> : members?.length ? members.map((member) => <div className="project-row" key={member.user_id}><div><b>{member.user_id === ws.userId ? "You" : names.get(member.user_id) || "Team member"}</b><small>Joined {new Date(member.created_at).toLocaleDateString("en-GB")}</small></div><span>{String(member.role).replaceAll("organization_", "").replaceAll("_", " ")}</span></div>) : <div className="empty-state"><div><b>No members found.</b><p>Your organization needs at least one owner before work can continue.</p></div></div>}
      </article>
      {isAdmin?<article className="workspace-card"><header><h2>Invite member</h2><span>Email-bound access</span></header><InvitationForm organizationId={ws.organizationId}/><p className="form-note">Invitations expire after seven days and can never grant owner access.</p></article>:null}
    </section>
    {isAdmin?<section className="workspace-card"><header><h2>Invitations</h2><span>{invitations.length} recent</span></header>{invitationsResult.error?<div className="empty-state"><div><b>Invitations could not be loaded.</b><p>No access changes were made.</p></div></div>:invitations.length?invitations.map((invitation)=><div className="project-row" key={invitation.id}><div><b>{invitation.email_normalized}</b><small>{String(invitation.role).replaceAll("organization_","").replaceAll("_"," ")} · created {new Date(invitation.created_at).toLocaleString("en-GB")} · expires {new Date(invitation.expires_at).toLocaleString("en-GB")}</small></div>{invitation.status==="pending"&&new Date(invitation.expires_at)>new Date()?<form action={revokeInvitation}><input type="hidden" name="organization_id" value={ws.organizationId}/><input type="hidden" name="invitation_id" value={invitation.id}/><button className="button button-small secondary" type="submit">Revoke</button></form>:<span>{invitation.status}</span>}</div>):<div className="empty-state"><div><b>No invitations yet.</b><p>Invite members when you are ready to collaborate.</p></div></div>}</section>:null}
  </div>;
}
