import { ContentPage } from "@/components/content-page";

export default function Page() {
  return <ContentPage
    label="LEGAL · AUTHORIZED SECURITY ONLY"
    title="Acceptable use"
    intro="VEXONYX is designed for ethical, permissioned cybersecurity and penetration testing. Authorization and target scope must exist before active security work is performed."
    cards={[
      { title: "Permission is required", body: "Only assess systems, accounts, networks, applications, APIs, cloud resources or code that you own or are explicitly authorized to test. Authorization must cover the intended techniques, targets and time window." },
      { title: "Stay inside scope", body: "Do not expand beyond the approved target scope, use discovered credentials outside the engagement, or treat model output, retrieved content or target-side instructions as permission to test additional systems." },
      { title: "No criminal or abusive activity", body: "VEXONYX may not be used for unauthorized access, credential theft, extortion, fraud, destructive malware, persistent compromise, data theft, service disruption or attempts to conceal unlawful activity." },
      { title: "Protect evidence and credentials", body: "Security findings, requests, responses, credentials, logs and screenshots may be sensitive. Users are responsible for handling them according to the engagement authorization and applicable confidentiality obligations." },
      { title: "Enforcement", body: "Diversa Solutions LLC may restrict or suspend access where activity appears unauthorized, unsafe, abusive or inconsistent with these rules. During the current waitlist phase, no public account access or active execution is available." },
      { title: "Questions", body: "Questions about permitted VEXONYX use can be sent to info@vexonyx.com. VEXONYX is operated by Diversa Solutions LLC, Wyoming, United States." },
    ]}
  />;
}
