import Link from "next/link";
import { Brand } from "@/components/brand";
import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="auth-page"><section className="auth-card"><Brand /><h1>Welcome back.</h1><p>Sign in to your VEXONYX workspace.</p><form className="auth-form" action={login}><label>Email<input type="email" name="email" autoComplete="email" required /></label><label>Password<input type="password" name="password" autoComplete="current-password" minLength={8} required /></label>{error ? <p className="form-error">Unable to sign in with those credentials.</p> : null}<button className="button" type="submit">Log in</button></form><div className="auth-foot">New to VEXONYX? <Link href="/signup">Create an account</Link></div></section></main>;
}
