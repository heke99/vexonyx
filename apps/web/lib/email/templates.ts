import "server-only";

export type EmailTemplate = { subject: string; preview: string; text: string; html: string };

const BRAND = { name: "VEXONYX", accent: "#d8ff55", background: "#080b0e", panel: "#11161b", text: "#f4f7f8", muted: "#a3acb5", faint: "#69727c" };
const OPERATOR = "Diversa Solutions LLC";
const CONTACT = "info@vexonyx.com";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function layout(input: { preview: string; eyebrow: string; title: string; body: string; ctaLabel?: string; ctaUrl?: string; footnote: string }) {
  const safePreview = escapeHtml(input.preview);
  const safeEyebrow = escapeHtml(input.eyebrow);
  const safeTitle = escapeHtml(input.title);
  const safeFootnote = escapeHtml(input.footnote);
  const safeUrl = input.ctaUrl ? escapeHtml(input.ctaUrl) : undefined;
  const safeLabel = input.ctaLabel ? escapeHtml(input.ctaLabel) : undefined;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${safeTitle}</title></head>
<body style="margin:0;background:${BRAND.background};color:${BRAND.text};font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreview}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.background};padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
<tr><td style="padding:0 4px 22px;font-size:13px;font-weight:700;letter-spacing:.18em;color:${BRAND.accent};">${BRAND.name}</td></tr>
<tr><td style="background:${BRAND.panel};border:1px solid #202831;border-radius:16px;padding:36px 32px;">
<div style="font-size:12px;font-weight:700;letter-spacing:.14em;color:${BRAND.muted};margin-bottom:14px;">${safeEyebrow}</div>
<h1 style="margin:0 0 16px;font-size:30px;line-height:1.15;color:${BRAND.text};">${safeTitle}</h1>
<div style="font-size:16px;line-height:1.65;color:${BRAND.muted};">${input.body}</div>
${safeUrl && safeLabel ? `<div style="margin:30px 0 10px;"><a href="${safeUrl}" style="display:inline-block;background:${BRAND.accent};color:#0a0d08;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:9px;">${safeLabel}</a></div>` : ""}
${safeUrl ? `<p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:${BRAND.faint};word-break:break-all;">If the button does not work, copy this link into your browser:<br />${safeUrl}</p>` : ""}
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.6;color:${BRAND.faint};">${safeFootnote}<br />VEXONYX is operated by ${OPERATOR}, Wyoming, United States.<br />Contact: ${CONTACT}<br />© 2026 ${OPERATOR}</td></tr>
</table></td></tr></table></body></html>`;
}

export function waitlistVerificationTemplate(input: { verificationUrl: string; name?: string | null }): EmailTemplate {
  const greeting = input.name ? `Hi ${escapeHtml(input.name)},` : "Hi,";
  const preview = "Verify your email to finish joining the VEXONYX waitlist.";
  return {
    subject: "Verify your email for VEXONYX",
    preview,
    text: `${input.name ? `Hi ${input.name},\n\n` : ""}Verify your email to finish joining the VEXONYX private beta waitlist. No product account is created by joining the waitlist.\n\n${input.verificationUrl}\n\nThis verification link expires in 30 minutes. If you did not request this, you can ignore this email.\n\nVEXONYX is operated by ${OPERATOR}, Wyoming, United States. Contact: ${CONTACT}`,
    html: layout({ preview, eyebrow: "PRIVATE BETA · WAITLIST", title: "Verify your email", body: `<p style="margin:0 0 12px;">${greeting}</p><p style="margin:0;">Confirm this email address to activate your VEXONYX waitlist registration. No product account is created at this stage; login and account access remain closed until invitations begin.</p>`, ctaLabel: "Verify my waitlist place", ctaUrl: input.verificationUrl, footnote: "This verification link expires in 30 minutes. If you did not request this, you can safely ignore this message." }),
  };
}

export function waitlistConfirmedTemplate(input: { name?: string | null; referralUrl?: string | null }): EmailTemplate {
  const greeting = input.name ? `Hi ${escapeHtml(input.name)},` : "Hi,";
  const preview = "Your VEXONYX waitlist registration is confirmed.";
  const referralText = input.referralUrl ? `\n\nYour referral link:\n${input.referralUrl}` : "";
  return {
    subject: "You're on the VEXONYX waitlist",
    preview,
    text: `${input.name ? `Hi ${input.name},\n\n` : ""}Your email is verified and your place on the VEXONYX private beta waitlist is confirmed. No account has been created.${referralText}\n\nWe'll contact you when access is available.\n\nVEXONYX is operated by ${OPERATOR}, Wyoming, United States. Contact: ${CONTACT}`,
    html: layout({ preview, eyebrow: "WAITLIST CONFIRMED", title: "You're on the list", body: `<p style="margin:0 0 12px;">${greeting}</p><p style="margin:0;">Your email is verified and your VEXONYX waitlist place is active. No product account has been created. We’ll contact you when private-beta access becomes available.</p>${input.referralUrl ? `<p style="margin:16px 0 0;">Want to share VEXONYX? Use your personal referral link.</p>` : ""}`, ctaLabel: input.referralUrl ? "View referral link" : undefined, ctaUrl: input.referralUrl ?? undefined, footnote: "You received this email because this address was verified on the VEXONYX waitlist." }),
  };
}

export function organizationInvitationTemplate(input: { organizationName: string; role: string; invitationUrl: string }): EmailTemplate {
  const organization = escapeHtml(input.organizationName);
  const role = escapeHtml(input.role.replaceAll("organization_", "").replaceAll("_", " "));
  const preview = `You've been invited to join ${input.organizationName} on VEXONYX.`;
  return {
    subject: `Join ${input.organizationName} on VEXONYX`, preview,
    text: `You've been invited to join ${input.organizationName} on VEXONYX as ${input.role.replaceAll("organization_", "").replaceAll("_", " ")}.\n\nAccept the invitation: ${input.invitationUrl}\n\nThis invitation is tied to this email address and expires in seven days.`,
    html: layout({ preview, eyebrow: "TEAM INVITATION", title: `Join ${input.organizationName}`, body: `<p style="margin:0;">You’ve been invited to join <strong style="color:${BRAND.text};">${organization}</strong> on VEXONYX as <strong style="color:${BRAND.text};">${role}</strong>. This invitation can only be accepted by this email address.</p>`, ctaLabel: "Accept invitation", ctaUrl: input.invitationUrl, footnote: "Team invitations remain disabled during the public waitlist phase and will only be used after account access opens." }),
  };
}
