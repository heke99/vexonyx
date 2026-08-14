import { ContentPage } from "@/components/content-page";

export default function Page() {
  return <ContentPage
    label="LEGAL · UPDATED AUGUST 14, 2026"
    title="Privacy notice"
    intro="VEXONYX is operated by Diversa Solutions LLC, Wyoming, United States. This notice explains the information used for the current waitlist and the security platform as access is introduced."
    cards={[
      { title: "What we collect", body: "For the waitlist we may collect your email address, name, company or team name, role, country, referral information, verification status and technical request metadata used for security and abuse prevention. When platform access opens, account, organization, project, file, evidence, usage and security-log data may also be processed to provide the service." },
      { title: "Why we use it", body: "We use information to operate and secure VEXONYX, manage and verify the waitlist, communicate about access, prevent abuse, maintain auditability, provide requested platform functions and meet applicable legal obligations." },
      { title: "No advertising sale or implicit training", body: "We do not sell personal information or customer security content for advertising. Customer project content is not intended to be used implicitly to train shared public models. Any future material change to these practices should be disclosed before it is introduced." },
      { title: "Processors and international handling", body: "VEXONYX uses infrastructure and service providers to operate the product, including hosting, database and transactional-email services. Those providers may process data in jurisdictions different from yours under their applicable service terms and safeguards." },
      { title: "Retention and deletion", body: "Waitlist and platform records are retained only as reasonably needed for the purpose collected, security, dispute handling and applicable legal obligations. Verification tokens are time-limited. Requests to access, correct or delete personal information can be sent to info@vexonyx.com and will be handled subject to applicable law and legitimate security or recordkeeping requirements." },
      { title: "Cookies and similar technologies", body: "The current public launch is designed without advertising or marketing cookies in the VEXONYX application. Strictly necessary session or security technologies may be used where required for secure product operation. See the Cookies page for the current implementation." },
      { title: "Contact and operator", body: "VEXONYX is operated by Diversa Solutions LLC, Wyoming, United States. Privacy and data requests: info@vexonyx.com." },
    ]}
  />;
}
