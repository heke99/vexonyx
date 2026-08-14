export async function POST() {
  return Response.json(
    { error: "VEXONYX is currently waitlist-only. Team invitations are disabled until access opens." },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}
