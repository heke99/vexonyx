import { ContentPage } from "@/components/content-page";

export default function Page() {
  return <ContentPage
    label="CONTACT"
    title="Talk to VEXONYX."
    intro="VEXONYX is currently waitlist-only. For company, privacy, legal, security or launch questions, contact our team directly."
    cards={[
      { title: "Email", body: "info@vexonyx.com" },
      { title: "Company", body: "VEXONYX is operated by Diversa Solutions LLC, Wyoming, United States." },
      { title: "Private beta", body: "Access is not open yet. Join the waitlist to register interest; joining does not create an account or guarantee an invitation." },
      { title: "Security teams and companies", body: "Use info@vexonyx.com for partnership, enterprise, deployment, retention or security-program questions while the private beta is being prepared." },
    ]}
  />;
}
