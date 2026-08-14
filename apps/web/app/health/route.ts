export function GET() { return Response.json({ status: "ok", service: "vexonyx-web" }, { headers: { "cache-control": "no-store" } }); }
