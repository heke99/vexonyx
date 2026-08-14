import Link from "next/link";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";
import { acceptInvitation } from "./actions";

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function InvitationPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{token?:string;error?:string}>}){
  const {id}=await params;const {token="",error}=await searchParams;
  const validShape=uuidPattern.test(id)&&token.length===64;
  const supabase=await createClient();const {data:claims}=await supabase.auth.getClaims();const loggedIn=Boolean(claims?.claims?.sub);
  const next=validShape?`/invite/${id}?token=${encodeURIComponent(token)}`:"/app";
  return <main className="auth-page"><section className="auth-card"><Brand/><div className="section-label">TEAM INVITATION</div><h1>{validShape?"Join a VEXONYX organization.":"This invitation link is invalid."}</h1><p>{validShape?"The invitation is bound to the email address it was sent to. Sign in with that same address before accepting.":"Ask an organization admin to create a fresh invitation."}</p>{error?<p className="form-error">This invitation could not be accepted. It may be expired, revoked, already used, or linked to a different email address.</p>:null}{validShape&&loggedIn?<form className="auth-form" action={acceptInvitation}><input type="hidden" name="invitation_id" value={id}/><input type="hidden" name="token" value={token}/><button className="button" type="submit">Accept invitation</button></form>:validShape?<div style={{display:"grid",gap:10}}><Link className="button" href={`/login?next=${encodeURIComponent(next)}`}>Log in to accept</Link><Link className="button secondary" href={`/signup?next=${encodeURIComponent(next)}`}>Create account</Link></div>:<Link className="button secondary" href="/">Back to VEXONYX</Link>}</section></main>;
}
