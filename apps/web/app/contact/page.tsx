import { ContentPage } from "@/components/content-page";

export default function Page() {
  return <ContentPage
    label="CONTACT"
    title="Talk to VEXONYX."
    intro="VEXONYX access is being introduced gradually. Public self-service signup remains closed, while authorized accounts can use the production platform and billing systems."
    cards={[
      { title: "General contact", body: "info@vexonyx.com" },
      { title: "Operator", body: "VEXONYX is operated by Diversa Solutions LLC, 30 N Gould St, Sheridan, Wyoming 82801, United States." },
      { title: "Privacy & data protection", body: "Send privacy requests, DPA questions and subprocessor questions to info@vexonyx.com. Please do not email unnecessary customer credentials, secrets or sensitive engagement evidence." },
      { title: "Billing & cancellation", body: "Organization owners and admins can stop a subscription renewal online from Plan & credits. For a verified billing error, refund question or if the online cancellation control is unavailable, contact info@vexonyx.com." },
      { title: "Security & abuse", body: "Report suspected VEXONYX account compromise, platform-security issues or misuse to info@vexonyx.com. Include enough information to investigate without disclosing unrelated third-party secrets." },
      { title: "Access", body: "Join the waitlist to register interest in access. Joining the waitlist does not create a paid account or guarantee an invitation, capacity or launch date." },
      { title: "Legal policies", href: "/legal", body: "Terms, Refund & Cancellation, Privacy, Cookies, Acceptable Use, the Data Processing Addendum and current Subprocessors are available from the VEXONYX Legal hub." },
    ]}
  />;
}
