import { ContentPage } from "@/components/content-page";

export default function Page() {
  return <ContentPage
    label="LEGAL · SUBPROCESSORS · UPDATED AUGUST 15, 2026"
    title="Subprocessors"
    intro="This page identifies material third-party providers currently used to operate VEXONYX where they may process customer personal data on our behalf or as an independent payment provider. The exact data involved depends on the feature used."
    cards={[
      { title: "Vercel", body: "Purpose: web hosting, deployment, content delivery and server-side application execution for VEXONYX. Data may include technical request information and data processed by application functions. Provider: Vercel Inc. Provider processing locations and transfer safeguards are governed by the applicable Vercel service terms and data-protection documentation." },
      { title: "Supabase", body: "Purpose: managed PostgreSQL database, authentication, storage and related backend infrastructure used by VEXONYX. Data may include account information, organization records, customer project data, usage records, billing state and security/audit information. Provider processing locations and safeguards are governed by the applicable Supabase service terms and data-protection documentation." },
      { title: "Stripe", body: "Purpose: payments, subscriptions, billing, tax-related checkout information and customer billing management. Stripe may act as a processor for some services and as an independent controller for certain payment, fraud, compliance or legal processing under its own terms. VEXONYX does not store complete raw payment-card numbers in its application database." },
      { title: "Resend", body: "Purpose: transactional email delivery, such as account, access, billing or service messages when enabled. Data may include recipient email address, message content and technical delivery metadata. Provider processing is governed by the applicable Resend service terms and data-protection documentation." },
      { title: "AI inference providers", body: "No shared external AI inference provider is listed here as active for customer security-content processing at the effective date of this page. Before a new material inference provider is authorized to receive Customer Personal Data, VEXONYX will update the applicable architecture, contracts and this subprocessor disclosure as required." },
      { title: "Changes", body: "We may add, replace or remove providers as VEXONYX evolves. Where the Data Processing Addendum or applicable law requires advance notice of a new material subprocessor, we will provide reasonable notice and a way to raise a legitimate data-protection objection before the new provider begins the relevant processing." },
      { title: "Questions", body: "Questions about subprocessors, processing locations or transfer safeguards can be sent to info@vexonyx.com. VEXONYX is operated by Diversa Solutions LLC, 30 N Gould St, Sheridan, Wyoming 82801, United States." },
    ]}
  />;
}
