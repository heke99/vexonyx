import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { WaitlistForm } from "@/components/waitlist-form";

const audience = [
  ["Independent", "Researchers, students, developers and security professionals can join directly."],
  ["Teams", "Security teams, consultancies, startups and larger organizations can register too."],
  ["Waitlist only", "No VEXONYX account is created at this stage. Login, signup and team invitations stay closed until access opens."],
] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const referralCode = typeof ref === "string" && /^[A-Z0-9]{4,40}$/i.test(ref) ? ref.toUpperCase() : undefined;

  return (
    <main className="content-page">
      <MarketingHeader />
      <section className="shell content-hero">
        <div className="section-label">PRIVATE BETA · WAITLIST ONLY</div>
        <h1>Join VEXONYX as yourself or with your team.</h1>
        <p>Independent researchers, developers, pentesters, security professionals and company teams can join. Verify your email to activate your waitlist place; this does not create a product account.</p>
      </section>
      <section className="shell" style={{ paddingBottom: 120 }}>
        <div className="content-body" style={{ paddingBottom: 28 }}>
          {audience.map(([title, text]) => <article className="content-card" key={title}><h2>{title}</h2><p>{text}</p></article>)}
        </div>
        <div style={{ maxWidth: 680 }}><WaitlistForm referralCode={referralCode} /></div>
      </section>
      <MarketingFooter />
    </main>
  );
}
