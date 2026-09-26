import { badRequest, parseDownloadRequest } from "@/lib/server/http";
import { jobs } from "@/lib/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ jobs: jobs.list() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const items: unknown[] = Array.isArray(body?.items) ? body.items.slice(0, 50) : [body];
  const parsed = items.map(parseDownloadRequest);
  const invalid = parsed.find((p) => typeof p === "string");
  if (typeof invalid === "string") return badRequest(invalid);
  const created = parsed.map((req) => jobs.create(req as Exclude<typeof req, string>));
  return Response.json({ jobs: created }, { status: 201 });
}

export async function DELETE() {
  for (const job of jobs.list()) jobs.dismiss(job.id);
  return Response.json({ ok: true });
}
