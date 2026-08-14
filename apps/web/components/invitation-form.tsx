"use client";

import { FormEvent, useState } from "react";

type State={kind:"idle"|"loading"|"success"|"error";message?:string;manualUrl?:string};

export function InvitationForm({organizationId}:{organizationId:string}){
  const [state,setState]=useState<State>({kind:"idle"});
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget;const data=new FormData(form);setState({kind:"loading"});
    try{
      const response=await fetch("/api/v1/team/invitations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({organizationId,email:String(data.get("email")??""),role:String(data.get("role")??"member")})});
      const payload=await response.json() as {error?:string;delivery?:string;invitationUrl?:string};
      if(!response.ok&&response.status!==202)throw new Error(payload.error??"Unable to create invitation");
      form.reset();setState({kind:"success",message:payload.delivery==="sent"?"Invitation email sent.":"Invitation created, but email delivery is not configured.",manualUrl:payload.invitationUrl});
    }catch(error){setState({kind:"error",message:error instanceof Error?error.message:"Unable to create invitation"});}
  }
  return <form className="auth-form" onSubmit={submit} style={{marginTop:16}}><label>Email<input name="email" type="email" required maxLength={320} placeholder="security@company.com"/></label><label>Role<select name="role" defaultValue="member"><option value="organization_admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option></select></label><button className="button" disabled={state.kind==="loading"} type="submit">{state.kind==="loading"?"Creating…":"Invite member"}</button>{state.message?<p className={state.kind==="error"?"form-error":"form-note"} role="status">{state.message}</p>:null}{state.manualUrl?<label>Manual invitation link<input readOnly value={state.manualUrl} onFocus={(event)=>event.currentTarget.select()}/></label>:null}</form>;
}
