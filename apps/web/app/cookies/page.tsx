import { ContentPage } from "@/components/content-page";

export default function Page() {
  return <ContentPage
    label="LEGAL · EFFECTIVE AUGUST 15, 2026"
    title="Cookie policy"
    intro="This Cookie Policy explains how VEXONYX uses cookies and similar browser technologies. The current production build is intentionally designed without advertising or marketing cookies."
    cards={[
      { title: "What cookies are", body: "Cookies are small pieces of data stored by a browser. Similar technologies include local storage, session storage and other browser identifiers. Some are necessary to provide a requested service, while others may require consent depending on their purpose and the law that applies." },
      { title: "Strictly necessary technologies", body: "VEXONYX may use strictly necessary authentication, session, CSRF/security, load-balancing and preference technologies to sign users in, maintain secure sessions, route requests, remember security-critical state and provide functionality a user explicitly requests. These technologies are not used for advertising." },
      { title: "Authentication cookies", body: "When account access is enabled for a user, our authentication provider may set first-party session cookies or cookie fragments needed to keep the user signed in and protect the account. Names can vary by environment and provider version, including Supabase authentication cookie patterns. Their duration depends on session and refresh-token settings." },
      { title: "Security and infrastructure", body: "Hosting and network infrastructure may use technically necessary request, routing or abuse-prevention mechanisms to deliver and protect VEXONYX. Technical request information can also be processed in server logs without being an advertising cookie." },
      { title: "Analytics", body: "VEXONYX does not currently intentionally deploy non-essential analytics cookies on the public site or application. If we introduce analytics that requires consent, it will remain disabled until the required consent is obtained and this policy is updated to identify the purpose and relevant provider." },
      { title: "Advertising and marketing", body: "VEXONYX does not currently use advertising cookies, behavioral advertising pixels or cross-site marketing trackers. We do not set those technologies before consent, and we will not introduce them without first implementing the disclosures, consent or opt-out controls required by applicable law." },
      { title: "Consent", body: "Where a non-essential cookie or similar technology legally requires consent, VEXONYX will request that consent before the technology is activated. Refusing optional cookies will not block the minimum service that can be provided without them. Withdrawing consent must be as easy as giving it." },
      { title: "Why there is no fake cookie banner", body: "Because the current production build does not intentionally use optional analytics or advertising cookies, VEXONYX does not display a consent banner that pretends optional tracking is active. Strictly necessary technologies do not require consent merely because they are cookies. If optional categories are enabled later, consent controls will be deployed before them." },
      { title: "Browser controls", body: "You can delete or block cookies through your browser. Blocking strictly necessary authentication or security cookies may prevent login or other requested product functions from working. Browser controls do not replace a consent mechanism for optional cookies where one is legally required." },
      { title: "Updates", body: "We review this policy when browser technologies or providers change. The effective date above identifies the current version. Material changes involving new optional tracking will be reflected here before or when the relevant technology is enabled as required by law." },
      { title: "Contact", body: "Questions about cookies or privacy can be sent to info@vexonyx.com. VEXONYX is operated by Diversa Solutions LLC, 30 N Gould St, Sheridan, Wyoming 82801, United States." },
    ]}
  />;
}
