import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin/guard";
import { setUserSuspension } from "../actions";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

function niceDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 120) : "";
  const requestedPage = typeof search.page === "string" ? Number.parseInt(search.page, 10) : 1;
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const { admin, userId } = await requireSuperadmin();
  const [{ data: rows, error }, { data: countData, error: countError }] = await Promise.all([
    admin.schema("app").rpc("superadmin_user_directory", { p_query: q || null, p_limit: PAGE_SIZE, p_offset: offset }),
    admin.schema("app").rpc("superadmin_user_directory_count", { p_query: q || null }),
  ]);
  if (error) throw error;
  if (countError) throw countError;

  const users = (rows ?? []) as Array<Record<string, unknown>>;
  const count = Number(countData ?? users.length);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const now = Date.now();

  return (
    <div className="admin-page">
      <div className="admin-heading">
        <div className="admin-heading-copy"><div className="admin-eyebrow">VEXONYX / SUPERADMIN</div><h1>Users</h1><p>Authenticated accounts, administrator state, organization membership and access suspension.</p></div>
        <div className="admin-heading-actions"><Link className="admin-button" href="/admin">Command center</Link></div>
      </div>

      <form className="admin-toolbar" method="get">
        <div className="admin-toolbar-left"><input className="admin-input" name="q" defaultValue={q} placeholder="Search email, name or user ID…" /><button className="admin-button" type="submit">Search</button>{q ? <Link className="admin-button" href="/admin/users">Clear</Link> : null}</div>
        <div className="admin-toolbar-right"><span className="admin-count">{count.toLocaleString()} accounts</span></div>
      </form>

      <section className="admin-card">
        {users.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Access</th><th>Organizations</th><th>Created</th><th>Last sign-in</th><th>Actions</th></tr></thead><tbody>
          {users.map((row) => {
            const bannedUntil = row.banned_until ? new Date(String(row.banned_until)).getTime() : 0;
            const suspended = bannedUntil > now;
            const isSuperadmin = Boolean(row.is_superadmin);
            return <tr key={String(row.id)}>
              <td><b>{String(row.display_name || row.email || row.id)}</b><small>{String(row.email || row.id)}</small></td>
              <td><span className={`admin-status ${isSuperadmin ? "good" : suspended ? "bad" : "neutral"}`}>{isSuperadmin ? "superadmin" : suspended ? "suspended" : "active"}</span></td>
              <td>{Number(row.organization_count ?? 0).toLocaleString()}</td>
              <td>{niceDate(row.account_created_at)}</td>
              <td>{niceDate(row.last_sign_in_at)}</td>
              <td>{isSuperadmin || String(row.id) === userId ? <span className="admin-count">Protected</span> : <form action={setUserSuspension}><input type="hidden" name="user_id" value={String(row.id)} /><input type="hidden" name="suspended" value={suspended ? "false" : "true"} /><button className={`admin-button ${suspended ? "" : "danger"}`} type="submit">{suspended ? "Restore" : "Suspend"}</button></form>}</td>
            </tr>;
          })}
        </tbody></table></div> : <div className="admin-empty"><b>No matching users</b>Authenticated beta users will appear here after account access opens.</div>}
        <div className="admin-pagination"><span>Page {page} of {totalPages}</span><div>{page > 1 ? <Link className="admin-button" href={{ pathname: "/admin/users", query: { ...(q ? { q } : {}), page: page - 1 } }}>← Previous</Link> : null}{page < totalPages ? <Link className="admin-button" href={{ pathname: "/admin/users", query: { ...(q ? { q } : {}), page: page + 1 } }}>Next →</Link> : null}</div></div>
      </section>
    </div>
  );
}
