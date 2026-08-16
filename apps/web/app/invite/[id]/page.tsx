import Link from "next/link";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";
import { acceptInvitation } from "./actions";

export default async function InvitationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string; error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const token = String(query.token ?? "");
  const validShape = /^[0-9a-f-]{36}$/i.test(id) && /^[0-9a-f]{64}$/i.test(token);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const next = `/invite/${id}?token=${token}`;

  return <main className="auth-page">
    <section className="auth-card">
      <Brand />
      <div className="section-label" style={{ marginTop: 28 }}>TEAM INVITATION</div>
      <h1>Join a VEXONYX workspace</h1>
      {!validShape ? <><p>This invitation link is invalid or incomplete.</p><Link className="button secondary" href="/login">Back to sign in</Link></> : query.error ? <><p className="form-error">This invitation could not be accepted. It may be expired, revoked, already used, or opened with a different email account.</p><form action="/auth/signout" method="post"><button className="button secondary" type="submit">Sign out and use another account</button></form></> : signedIn ? <><p>The invitation is bound to the invited email address. Accepting it adds your current account to the organization with the role selected by its admin.</p><form className="auth-form" action={acceptInvitation}><input type="hidden" name="invitation_id" value={id}/><input type="hidden" name="token" value={token}/><button className="button" type="submit">Accept invitation</button></form></> : <><p>Sign in with the exact email address that received this invitation. Public account creation remains closed.</p><Link className="button" href={`/login?next=${encodeURIComponent(next)}`}>Sign in to accept</Link><div className="auth-foot">Do not have a VEXONYX beta account yet? Ask your organization admin or VEXONYX support to provision access.</div></>}
    </section>
  </main>;
}
