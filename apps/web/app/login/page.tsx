import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";
import { login } from "./actions";

function safeNext(value: string | undefined) {
  return value?.startsWith("/app") || value?.startsWith("/invite/") ? value : "/app";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const query = await searchParams;
  const next = safeNext(query.next);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect(next);

  const message = query.error === "access"
    ? "This account does not have workspace access yet. Ask an organization admin for an invitation."
    : query.error
      ? "Email or password was not accepted."
      : null;

  return <main className="auth-page">
    <section className="auth-card">
      <Brand />
      <div className="section-label" style={{ marginTop: 28 }}>CUSTOMER ACCESS</div>
      <h1>Sign in to VEXONYX</h1>
      <p>Existing beta customers and invited team members can sign in here. New public registration remains waitlist-only.</p>
      <form className="auth-form" action={login}>
        <input type="hidden" name="next" value={next} />
        <label><span>EMAIL</span><input name="email" type="email" autoComplete="username" maxLength={320} required placeholder="you@company.com" /></label>
        <label><span>PASSWORD</span><input name="password" type="password" autoComplete="current-password" maxLength={128} required placeholder="Your password" /></label>
        <button className="button" type="submit">Sign in</button>
        {message ? <p className="form-error" role="alert">{message}</p> : null}
      </form>
      <div className="auth-foot">Need an account? <Link href="/waitlist">Join the waitlist</Link>. Public signup is not enabled.</div>
    </section>
  </main>;
}
