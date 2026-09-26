import { jobs } from "@/lib/server/jobs";
import type { Job } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const onUpdate = (job: Job) => send("job", job);
      const onRemove = (id: string) => send("remove", { id });
      const onFinished = (job: Job) => send("finished", { id: job.id, status: job.status });
      jobs.on("update", onUpdate);
      jobs.on("remove", onRemove);
      jobs.on("finished", onFinished);
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 15_000);

      cleanup = () => {
        clearInterval(heartbeat);
        jobs.off("update", onUpdate);
        jobs.off("remove", onRemove);
        jobs.off("finished", onFinished);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", () => cleanup());
      send("snapshot", jobs.list());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
