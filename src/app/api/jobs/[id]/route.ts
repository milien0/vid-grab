import type { NextRequest } from "next/server";
import { jobs } from "@/lib/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const job = jobs.get(id);
  return job ? Response.json({ job }) : Response.json({ error: "Not found" }, { status: 404 });
}

/** Actions: cancel | retry. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };
  if (action === "cancel") {
    return jobs.cancel(id) ? Response.json({ ok: true }) : Response.json({ error: "Not cancellable" }, { status: 409 });
  }
  if (action === "retry") {
    const job = jobs.retry(id);
    return job ? Response.json({ job }) : Response.json({ error: "Not retryable" }, { status: 409 });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  return jobs.dismiss(id) ? Response.json({ ok: true }) : Response.json({ error: "Job is still active" }, { status: 409 });
}
