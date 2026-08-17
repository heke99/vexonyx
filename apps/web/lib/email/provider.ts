import "server-only";
import {
  adminVerificationCodeTemplate,
  organizationInvitationTemplate,
  waitlistAccessInvitationTemplate,
  waitlistConfirmedTemplate,
  waitlistVerificationTemplate,
  type EmailTemplate,
} from "./templates";

export type EmailResult =
  | { sent: true; messageId?: string }
  | { sent: false; reason: "not_configured" | "provider_error" };

export interface EmailProvider {
  sendWaitlistVerification(input: { to: string; verificationUrl: string; name?: string | null }): Promise<EmailResult>;
  sendWaitlistConfirmed(input: { to: string; name?: string | null; referralUrl?: string | null }): Promise<EmailResult>;
  sendWaitlistAccessInvitation(input: { to: string; invitationUrl: string; name?: string | null }): Promise<EmailResult>;
  sendOrganizationInvitation(input: { to: string; organizationName: string; role: string; invitationUrl: string }): Promise<EmailResult>;
  sendAdminVerificationCode(input: { to: string; code: string; purpose: "login" | "password_reset" }): Promise<EmailResult>;
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

    if (!response.ok) return { sent: false, reason: "provider_error" };
    const body = await response.json().catch(() => null) as { id?: string } | null;
    return { sent: true, messageId: body?.id };
  }

  async sendWaitlistVerification(input: { to: string; verificationUrl: string; name?: string | null }): Promise<EmailResult> {
    return this.send({ to: input.to, fromOverride: process.env.WAITLIST_FROM_EMAIL, template: waitlistVerificationTemplate(input) });
  }

  async sendWaitlistConfirmed(input: { to: string; name?: string | null; referralUrl?: string | null }): Promise<EmailResult> {
    return this.send({ to: input.to, fromOverride: process.env.WAITLIST_FROM_EMAIL, template: waitlistConfirmedTemplate(input) });
  }

  async sendWaitlistAccessInvitation(input: { to: string; invitationUrl: string; name?: string | null }): Promise<EmailResult> {
    return this.send({ to: input.to, fromOverride: process.env.WAITLIST_FROM_EMAIL, template: waitlistAccessInvitationTemplate(input) });
  }

  async sendOrganizationInvitation(input: { to: string; organizationName: string; role: string; invitationUrl: string }): Promise<EmailResult> {
    return this.send({ to: input.to, template: organizationInvitationTemplate(input) });
  }

  async sendAdminVerificationCode(input: { to: string; code: string; purpose: "login" | "password_reset" }): Promise<EmailResult> {
    return this.send({
      to: input.to,
      fromOverride: process.env.TRANSACTIONAL_FROM_EMAIL || process.env.WAITLIST_FROM_EMAIL,
      template: adminVerificationCodeTemplate(input),
    });
  }
}

export function createEmailProvider(): EmailProvider {
  return new ResendEmailProvider();
}
