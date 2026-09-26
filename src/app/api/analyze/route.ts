import { badRequest, normalizeUrl, parseEngine } from "@/lib/server/http";
import { analyze } from "@/lib/server/ytdlp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const url = normalizeUrl(body?.url);
  if (!url) return badRequest("Please enter a valid http(s) link.");
  const result = await analyze(url, parseEngine(body?.engine));
  if (!result.ok) return Response.json({ error: result.error, tried: result.tried }, { status: 422 });
  return Response.json({ info: result.info });
}
