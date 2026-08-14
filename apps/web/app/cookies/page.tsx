import { ContentPage } from "@/components/content-page";

export default function Page() {
  return <ContentPage
    label="LEGAL · UPDATED AUGUST 14, 2026"
    title="Cookies"
    intro="This page describes the current VEXONYX cookie and similar-technology setup during the waitlist-only launch."
    cards={[
      { title: "Current public site", body: "The VEXONYX application is not currently designed to use advertising or marketing cookies on the public website or waitlist. We have not added an advertising analytics stack to the current application." },
      { title: "Strictly necessary technology", body: "The platform includes support for strictly necessary authentication and session cookies for secure account operation. Public login and account creation are currently disabled, so those account flows are not available during the waitlist phase." },
      { title: "Security and infrastructure", body: "Hosting, database and network providers may process technical request information needed to deliver, secure and protect the service. Such processing can occur independently of advertising cookies." },
      { title: "Future analytics or optional cookies", body: "If VEXONYX later introduces non-essential analytics, advertising or preference cookies, this notice and any required consent controls should be updated before those technologies are activated." },
      { title: "Contact", body: "Questions about cookies or privacy can be sent to info@vexonyx.com. VEXONYX is operated by Diversa Solutions LLC, Wyoming, United States." },
    ]}
  />;
}
