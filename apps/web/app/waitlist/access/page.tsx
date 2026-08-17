import { createHash } from "node:crypto";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing-header";
import { WaitlistAccessForm } from "@/components/waitlist-access-form";
import { createAdminClient } from "@/lib/supabase/admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function WaitlistAccessPage({ searchParams }: { searchParams: Promise<{ entry?: string; token?: string }> }) {
  const { entry = "", token = "" } = await searchParams;
  const structurallyValid = uuidPattern.test(entry) && token.length >= 32 && token.length <= 128;
  const admin = structurallyValid ? createAdminClient() : null;
  const inspected = admin ? await admin.schema("launch").rpc("inspect_waitlist_invitation", {
    p_entry_id: entry,
    p_token_hash: createHash("sha256").update(token).digest("hex"),
  }) : null;
  const invitation = inspected && !inspected.error ? (Array.isArray(inspected.data) ? inspected.data[0] : inspected.data) : null;
  const valid = Boolean(invitation?.invitation_id);

  return <main className="content-page">
    <MarketingHeader />
    <section className="shell content-hero">
      <div className="section-label">PRIVATE BETA · ACCESS</div>
      <h1>{valid ? "Create your VEXONYX account." : "This access link is no longer valid."}</h1>
      <p>{valid ? "Your verified waitlist email has been approved for private-beta access. Choose a password to activate the same identity as a VEXONYX account." : "The invitation may have expired, been replaced, or already been used. If you already activated access, sign in instead."}</p>
    </section>
    <section className="shell" style={{ maxWidth: 680, paddingBottom: 120 }}>
      {valid ? <WaitlistAccessForm entry={entry} token={token} /> : <div className="workspace-card"><div className="empty-state"><div><b>Need access help?</b><p>Return to the waitlist or sign in if your account is already active.</p></div></div></div>}
      <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link className="button secondary" href="/waitlist">Back to waitlist</Link>
        <Link className="button secondary" href="/login">Sign in</Link>
      </div>
    </section>
  </main>;
}
