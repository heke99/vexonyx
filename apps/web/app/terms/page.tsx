import { ContentPage } from "@/components/content-page";

export default function Page() {
  return <ContentPage
    label="LEGAL · UPDATED AUGUST 14, 2026"
    title="Terms of use"
    intro="These terms govern the public VEXONYX website and waitlist operated by Diversa Solutions LLC, Wyoming, United States. Product-access terms may be supplemented before private-beta accounts are enabled."
    cards={[
      { title: "Waitlist only", body: "Joining the VEXONYX waitlist does not create a user account, grant platform access, guarantee an invitation or create a right to any launch date, feature, capacity or pricing. Login, account creation and team invitations are currently disabled." },
      { title: "Authorized security use", body: "VEXONYX is intended for legitimate security work on systems and targets for which the user has valid authorization. You may not use the service to exceed an approved scope or for unlawful access, theft, disruption, malware delivery or other unauthorized activity." },
      { title: "Information you submit", body: "You are responsible for the accuracy and lawfulness of information you submit to the waitlist or, when access opens, to the platform. Do not submit confidential target data to the public waitlist form." },
      { title: "Pre-release status", body: "Descriptions, screenshots and demonstrations may show planned, synthetic or pre-release functionality. Features may change before access is offered. Any AI-generated analysis must be reviewed by qualified users before it is relied upon in a security engagement." },
      { title: "Intellectual property", body: "VEXONYX branding, software, interface design and service materials are owned by or licensed to Diversa Solutions LLC except where third-party rights or open-source licenses apply. These terms do not transfer ownership of customer data or customer-created materials." },
      { title: "Availability and warranties", body: "The public site and waitlist are provided on an as-available basis. To the extent permitted by applicable law, Diversa Solutions LLC does not guarantee uninterrupted availability, future admission to the beta or that pre-release descriptions will remain unchanged." },
      { title: "Governing law", body: "Unless mandatory law requires otherwise, these terms are governed by the laws of the State of Wyoming, United States, without regard to conflict-of-law rules." },
      { title: "Contact", body: "VEXONYX is operated by Diversa Solutions LLC, Wyoming, United States. Questions about these terms can be sent to info@vexonyx.com." },
    ]}
  />;
}
