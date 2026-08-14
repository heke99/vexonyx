import Link from "next/link";
import { Brand } from "@/components/brand";
import { safeLocalPath } from "@/lib/safe-redirect";
import { signup } from "./actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; created?: string; next?: string }> }) {
  const query = await searchParams;
  const next = safeLocalPath(query.next, "/app");
  const nextQuery = next === "/app" ? "" : `?next=${encodeURIComponent(next)}`;
  return <main className="auth-page"><section className="auth-card"><Brand /><h1>Create workspace access.</h1><p>Your account and organization access are enforced independently from other workspaces from the first sign-in.</p>{query.created ? <div className="form-success"><span>✓</span><div><strong>Check your email.</strong><p>Confirm your address to finish account setup{next !== "/app" ? " and continue your invitation" : ""}.</p></div></div> : <form className="auth-form" action={signup}><input type="hidden" name="next" value={next}/><label>Name<input name="name" autoComplete="name" maxLength={120} /></label><label>Email<input type="email" name="email" autoComplete="email" required /></label><label>Password<input type="password" name="password" autoComplete="new-password" minLength={10} required /></label>{query.error ? <p className="form-error">Account creation failed. Review the details and try again.</p> : null}<button className="button" type="submit">Create account</button></form>}<div className="auth-foot">Already have an account? <Link href={`/login${nextQuery}`}>Log in</Link></div></section></main>;
}
