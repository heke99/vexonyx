import { MarketingHeader } from "@/components/marketing-header";
import { WaitlistForm } from "@/components/waitlist-form";

const audience = [
  ["Independent", "Researchers, students, developers and security professionals can join directly."],
  ["Teams", "Security teams, consultancies, startups and larger organizations can register too."],
  ["Private beta", "Everyone verifies their email before referral access becomes active."],
] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const referralCode = typeof ref === "string" && /^[A-Z0-9]{4,40}$/i.test(ref) ? ref.toUpperCase() : undefined;

  return (
    <main className="content-page">
      <MarketingHeader />
      <section className="shell content-hero">
        <div className="section-label">PRIVATE BETA</div>
        <h1>Join VEXONYX as yourself or with your team.</h1>
        <p>VEXONYX is not limited to companies. Independent researchers, students, developers, security professionals and company teams can all join the waitlist.</p>
      </section>
      <section className="shell" style={{ paddingBottom: 120 }}>
        <div className="content-body" style={{ paddingBottom: 28 }}>
          {audience.map(([title, text]) => <article className="content-card" key={title}><h2>{title}</h2><p>{text}</p></article>)}
        </div>
        <div style={{ maxWidth: 680 }}><WaitlistForm referralCode={referralCode} /></div>
      </section>
    </main>
  );
}
