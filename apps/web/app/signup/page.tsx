import Link from "next/link";
import { Brand } from "@/components/brand";
import { signup } from "./actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; created?: string }> }) {
  const query = await searchParams;
  return <main className="auth-page"><section className="auth-card"><Brand /><h1>Create workspace access.</h1><p>Accounts are tenant-isolated from first sign-in.</p>{query.created ? <div className="form-success"><span>✓</span><div><strong>Check your email.</strong><p>Confirm your address to finish account setup.</p></div></div> : <form className="auth-form" action={signup}><label>Name<input name="name" autoComplete="name" maxLength={120} /></label><label>Email<input type="email" name="email" autoComplete="email" required /></label><label>Password<input type="password" name="password" autoComplete="new-password" minLength={10} required /></label>{query.error ? <p className="form-error">Account creation failed. Review the details and try again.</p> : null}<button className="button" type="submit">Create account</button></form>}<div className="auth-foot">Already have an account? <Link href="/login">Log in</Link></div></section></main>;
}
