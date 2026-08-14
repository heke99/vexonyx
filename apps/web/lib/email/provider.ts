import "server-only";

type EmailResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };

export interface EmailProvider {
  sendWaitlistVerification(input: { to: string; verificationUrl: string }): Promise<EmailResult>;
  sendOrganizationInvitation(input: { to:string; organizationName:string; role:string; invitationUrl:string }): Promise<EmailResult>;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character] ?? character);
}

class ResendEmailProvider implements EmailProvider {
  private async send(input:{to:string;subject:string;text:string;html:string;fromOverride?:string}):Promise<EmailResult>{
    const apiKey=process.env.RESEND_API_KEY;
    const from=input.fromOverride||process.env.TRANSACTIONAL_FROM_EMAIL||process.env.WAITLIST_FROM_EMAIL;
    if(!apiKey||!from)return {sent:false,reason:"not_configured"};
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},body:JSON.stringify({from,to:[input.to],subject:input.subject,text:input.text,html:input.html}),cache:"no-store"});
    return response.ok?{sent:true}:{sent:false,reason:"provider_error"};
  }

  async sendWaitlistVerification({ to, verificationUrl }: { to: string; verificationUrl: string }): Promise<EmailResult> {
    const safeUrl = escapeHtml(verificationUrl);
    return this.send({
      to,
      fromOverride:process.env.WAITLIST_FROM_EMAIL,
      subject:"Verify your VEXONYX waitlist email",
      text:`Verify your email for the VEXONYX private beta waitlist: ${verificationUrl}`,
      html:`<div style="font-family:Arial,sans-serif;background:#0a0c0f;color:#f5f5f2;padding:32px"><div style="max-width:560px;margin:auto"><div style="font-size:12px;letter-spacing:.16em;color:#d8ff55;margin-bottom:24px">VEXONYX</div><h1 style="font-size:28px;margin:0 0 14px">Verify your email</h1><p style="color:#a7adb5;line-height:1.6">Confirm this email address to finish joining the VEXONYX private beta waitlist.</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#d8ff55;color:#0a0c08;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Verify email</a></p><p style="font-size:12px;color:#6f7680">This link expires in 30 minutes. If you did not request access, you can ignore this email.</p></div></div>`,
    });
  }

  async sendOrganizationInvitation({to,organizationName,role,invitationUrl}:{to:string;organizationName:string;role:string;invitationUrl:string}):Promise<EmailResult>{
    const safeUrl=escapeHtml(invitationUrl);const safeOrganization=escapeHtml(organizationName);const safeRole=escapeHtml(role.replaceAll("organization_","").replaceAll("_"," "));
    return this.send({to,subject:`Join ${organizationName} on VEXONYX`,text:`You have been invited to ${organizationName} on VEXONYX as ${safeRole}. Accept: ${invitationUrl}`,html:`<div style="font-family:Arial,sans-serif;background:#0a0c0f;color:#f5f5f2;padding:32px"><div style="max-width:560px;margin:auto"><div style="font-size:12px;letter-spacing:.16em;color:#d8ff55;margin-bottom:24px">VEXONYX</div><h1 style="font-size:28px;margin:0 0 14px">Join ${safeOrganization}</h1><p style="color:#a7adb5;line-height:1.6">You have been invited as <strong style="color:#f5f5f2">${safeRole}</strong>. The invitation is bound to this email address and expires in seven days.</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#d8ff55;color:#0a0c08;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Accept invitation</a></p><p style="font-size:12px;color:#6f7680">If you were not expecting this invitation, you can ignore this email.</p></div></div>`});
  }
}

export function createEmailProvider(): EmailProvider {
  return new ResendEmailProvider();
}
