import { DOWNLOAD_DIR, MAX_CONCURRENT } from "@/lib/server/config";
import { cookieStatus } from "@/lib/server/cookies";
import { engineStatuses, toolVersions } from "@/lib/server/ytdlp";
import type { HealthInfo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [engines, tools] = await Promise.all([engineStatuses(), toolVersions()]);
  const health: HealthInfo = {
    engines,
    ffmpeg: tools.ffmpeg,
    deno: tools.deno,
    cookies: cookieStatus(),
    downloadDir: DOWNLOAD_DIR,
    maxConcurrent: MAX_CONCURRENT,
  };
  return Response.json(health);
}
