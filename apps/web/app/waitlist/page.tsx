import { MarketingHeader } from "@/components/marketing-header";
import { WaitlistForm } from "@/components/waitlist-form";

export default async function Page({searchParams}:{searchParams:Promise<{ref?:string}>}) {
  const {ref} = await searchParams;
  const referralCode = typeof ref === "string" && /^[A-Z0-9]{4,40}$/i.test(ref) ? ref.toUpperCase() : undefined;
  return <main className="content-page"><MarketingHeader/><section className="shell content-hero"><div className="section-label">PRIVATE BETA</div><h1>Join the VEXONYX waitlist.</h1><p>Register for private beta access. Verify your email before referral access becomes active.</p></section><section className="shell" style={{maxWidth:620,paddingBottom:120}}><WaitlistForm referralCode={referralCode}/></section></main>;
}
