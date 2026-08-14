import Link from "next/link";
import { Brand } from "@/components/brand";
import { safeLocalPath } from "@/lib/safe-redirect";
import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next: rawNext } = await searchParams;
  const next = safeLocalPath(rawNext, "/app");
  const nextQuery = next === "/app" ? "" : `?next=${encodeURIComponent(next)}`;
  return <main className="auth-page"><section className="auth-card"><Brand /><h1>Welcome back.</h1><p>Sign in to your VEXONYX workspace.</p><form className="auth-form" action={login}><input type="hidden" name="next" value={next}/><label>Email<input type="email" name="email" autoComplete="email" required /></label><label>Password<input type="password" name="password" autoComplete="current-password" minLength={8} required /></label>{error ? <p className="form-error">Unable to sign in with those credentials.</p> : null}<button className="button" type="submit">Log in</button></form><div className="auth-foot">New to VEXONYX? <Link href={`/signup${nextQuery}`}>Create an account</Link></div></section></main>;
}
