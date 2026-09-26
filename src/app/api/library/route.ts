import { jobs } from "@/lib/server/jobs";
import { listLibrary } from "@/lib/server/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listLibrary(jobs.activeIds());
  return Response.json({ items });
}
