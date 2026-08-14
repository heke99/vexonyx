import Link from "next/link";
import { MarketingHeader } from "@/components/marketing-header";

export default async function VerifiedWaitlistPage({searchParams}:{searchParams:Promise<{status?:string;ref?:string}>}) {
  const {status,ref} = await searchParams;
  const verified = status === "verified";
  const unavailable = status === "unavailable";

  return <main className="content-page">
    <MarketingHeader/>
    <section className="shell content-hero">
      <div className="section-label">PRIVATE BETA</div>
      <h1>{verified ? "Email verified." : unavailable ? "Verification is temporarily unavailable." : "This verification link is no longer valid."}</h1>
      <p>{verified ? "Your VEXONYX waitlist registration is complete. You can now use your referral link to invite another security professional." : unavailable ? "Your waitlist registration is safe. Try the verification link again after email verification is available." : "The link may have expired or already been used. Submit the waitlist form again to receive a fresh verification email."}</p>
    </section>
    <section className="shell" style={{maxWidth:720,paddingBottom:120}}>
      <article className="workspace-card">
        {verified && ref ? <><header><h2>Your referral link</h2><span>Verified</span></header><div className="project-row"><div><b>{`/waitlist?ref=${ref}`}</b><small>Share this link. Referral attribution is recorded only when someone joins through it.</small></div><Link className="button button-small" href={`/waitlist?ref=${encodeURIComponent(ref)}`}>Open link</Link></div></> : <div className="empty-state"><div><b>{verified ? "You're verified." : "Need a new link?"}</b><p>{verified ? "Your private beta registration is ready for invitation review." : "Return to the waitlist form and submit the same email address again."}</p></div></div>}
      </article>
      <div style={{marginTop:18}}><Link className="button secondary" href="/waitlist">Back to waitlist</Link></div>
    </section>
  </main>;
}
