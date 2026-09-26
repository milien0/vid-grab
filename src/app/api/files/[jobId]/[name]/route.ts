import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { deleteLibraryFile, resolveLibraryFile } from "@/lib/server/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mkv: "video/x-matroska",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  opus: "audio/ogg",
  ogg: "audio/ogg",
  flac: "audio/flac",
  wav: "audio/wav",
};

function contentDisposition(name: string, inline: boolean) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/files/[jobId]/[name]">) {
  const { jobId, name } = await ctx.params;
  const decoded = decodeURIComponent(name);
  const file = resolveLibraryFile(jobId, decoded);
  if (!file) return new Response("Not found", { status: 404 });

  const { size } = await fs.promises.stat(file);
  const ext = path.extname(file).slice(1).toLowerCase();
  const inline = request.nextUrl.searchParams.get("inline") === "1";
  const headers: Record<string, string> = {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Content-Disposition": contentDisposition(decoded, inline),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=0",
  };

  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = fs.createReadStream(file, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
    });
  }

  const stream = fs.createReadStream(file);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: { ...headers, "Content-Length": String(size) },
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/files/[jobId]/[name]">) {
  const { jobId, name } = await ctx.params;
  const ok = await deleteLibraryFile(jobId, decodeURIComponent(name));
  return ok ? Response.json({ ok: true }) : Response.json({ error: "Not found" }, { status: 404 });
}
