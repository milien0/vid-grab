import { cookieStatus, deleteCookies, saveCookies } from "@/lib/server/cookies";
import { badRequest } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ cookies: cookieStatus() });
}

export async function POST(request: Request) {
  const text = await request.text();
  if (!text.trim()) return badRequest("The cookies file is empty.");
  if (text.length > 5_000_000) return badRequest("That file is too large to be a cookies.txt.");
  const result = saveCookies(text);
  if (!result.ok) return badRequest(result.error);
  return Response.json({ cookies: result.status });
}

export async function DELETE() {
  deleteCookies();
  return Response.json({ cookies: cookieStatus() });
}
