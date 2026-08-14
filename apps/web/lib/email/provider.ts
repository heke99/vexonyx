import "server-only";
import {
  organizationInvitationTemplate,
  waitlistConfirmedTemplate,
  waitlistVerificationTemplate,
  type EmailTemplate,
} from "./templates";

type EmailResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };

export interface EmailProvider {
  sendWaitlistVerification(input: { to: string; verificationUrl: string; name?: string | null }): Promise<EmailResult>;
  sendWaitlistConfirmed(input: { to: string; name?: string | null; referralUrl?: string | null }): Promise<EmailResult>;
  sendOrganizationInvitation(input: { to: string; organizationName: string; role: string; invitationUrl: string }): Promise<EmailResult>;
}

class ResendEmailProvider implements EmailProvider {
  private async send(input: { to: string; template: EmailTemplate; fromOverride?: string }): Promise<EmailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = input.fromOverride || process.env.TRANSACTIONAL_FROM_EMAIL || process.env.WAITLIST_FROM_EMAIL;
    if (!apiKey || !from) return { sent: false, reason: "not_configured" };

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.template.subject,
        text: input.template.text,
        html: input.template.html,
        headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
      }),
      cache: "no-store",
    });

    return response.ok ? { sent: true } : { sent: false, reason: "provider_error" };
  }

  async sendWaitlistVerification(input: { to: string; verificationUrl: string; name?: string | null }): Promise<EmailResult> {
    return this.send({
      to: input.to,
      fromOverride: process.env.WAITLIST_FROM_EMAIL,
      template: waitlistVerificationTemplate(input),
    });
  }

  async sendWaitlistConfirmed(input: { to: string; name?: string | null; referralUrl?: string | null }): Promise<EmailResult> {
    return this.send({
      to: input.to,
      fromOverride: process.env.WAITLIST_FROM_EMAIL,
      template: waitlistConfirmedTemplate(input),
    });
  }

  async sendOrganizationInvitation(input: { to: string; organizationName: string; role: string; invitationUrl: string }): Promise<EmailResult> {
    return this.send({
      to: input.to,
      template: organizationInvitationTemplate(input),
    });
  }
}

export function createEmailProvider(): EmailProvider {
  return new ResendEmailProvider();
}
