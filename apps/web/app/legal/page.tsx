import { ContentPage } from "@/components/content-page";

export default function Page() {
  return <ContentPage
    label="VEXONYX · LEGAL"
    title="Legal & trust"
    intro="The policies below govern VEXONYX website access, paid service use, authorized cybersecurity activity, billing and customer-data processing. The effective date on each policy identifies its current version."
    cards={[
      { title: "Terms of Service", href: "/terms", body: "The primary contract for accounts, subscriptions, credits, authorized security use, customer data, AI output, liability, suspension and governing law." },
      { title: "Refund & Cancellation", href: "/refunds", body: "The no-refund policy, mandatory legal exceptions, credit-pack treatment and the rules for stopping recurring subscription renewals." },
      { title: "Privacy Notice", href: "/privacy", body: "How Diversa Solutions LLC handles website, account, billing, security, support and customer-provided personal data, including privacy rights and international transfers." },
      { title: "Cookie Policy", href: "/cookies", body: "The current essential-only cookie and browser-technology setup and the rule that optional tracking requiring consent must remain off until consent is obtained." },
      { title: "Acceptable Use", href: "/acceptable-use", body: "Authorization, scope and safety requirements for ethical hacking, penetration testing, vulnerability research and any agent or tool execution through VEXONYX." },
      { title: "Data Processing Addendum", href: "/dpa", body: "Controller/processor terms that apply when VEXONYX processes Customer Personal Data on an organization's instructions." },
      { title: "Subprocessors", href: "/subprocessors", body: "The material infrastructure, payment and communication providers currently used to operate VEXONYX and the process for material changes." },
      { title: "Security", href: "/security", body: "Product security principles and architecture information intended to help customers assess how VEXONYX protects sensitive security work." },
      { title: "Contact", href: "/contact", body: "Legal, billing, privacy and policy questions: info@vexonyx.com. Operator: Diversa Solutions LLC, 30 N Gould St, Sheridan, Wyoming 82801, United States." },
    ]}
  />;
}
