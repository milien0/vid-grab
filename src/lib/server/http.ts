import type { DownloadOptions, DownloadRequest, EnginePref, Preset } from "@/lib/types";
import { AUDIO_PRESETS, DEFAULT_OPTIONS, VIDEO_PRESETS } from "@/lib/types";

export function badRequest(message: string) {
  return Response.json({ error: { code: "bad-request", message, hint: "" } }, { status: 400 });
}

export function normalizeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function parseEngine(v: unknown): EnginePref {
  return v === "fork" || v === "upstream" ? v : "auto";
}

const PRESETS = new Set<string>([...VIDEO_PRESETS, ...AUDIO_PRESETS, "custom"]);
const TIME = /^(\d{1,2}:){0,2}\d{1,2}(\.\d+)?$/;

export function parseDownloadRequest(body: unknown): DownloadRequest | string {
  if (!body || typeof body !== "object") return "Invalid request body.";
  const b = body as Record<string, unknown>;
  const url = normalizeUrl(b.url);
  if (!url) return "Please enter a valid http(s) link.";
  const preset = (typeof b.preset === "string" && PRESETS.has(b.preset) ? b.preset : "best") as Preset;
  const o = (b.options ?? {}) as Partial<Record<keyof DownloadOptions, unknown>>;
  const bool = (k: keyof DownloadOptions) => (typeof o[k] === "boolean" ? (o[k] as boolean) : (DEFAULT_OPTIONS[k] as boolean));
  const str = (k: keyof DownloadOptions) => (typeof o[k] === "string" ? (o[k] as string).slice(0, 64) : "");
  const clipStart = str("clipStart").trim();
  const clipEnd = str("clipEnd").trim();
  if (clipStart && !TIME.test(clipStart)) return "Clip start must look like 1:30 or 90.";
  if (clipEnd && !TIME.test(clipEnd)) return "Clip end must look like 2:45 or 165.";
  return {
    url,
    preset,
    formatId: typeof b.formatId === "string" ? b.formatId.slice(0, 64) : undefined,
    engine: parseEngine(b.engine),
    title: typeof b.title === "string" ? b.title.slice(0, 300) : undefined,
    thumbnail: typeof b.thumbnail === "string" && /^https?:\/\//.test(b.thumbnail) ? b.thumbnail : undefined,
    options: {
      embedMetadata: bool("embedMetadata"),
      embedThumbnail: bool("embedThumbnail"),
      embedSubs: bool("embedSubs"),
      subLangs: str("subLangs") || DEFAULT_OPTIONS.subLangs,
      sponsorBlock: bool("sponsorBlock"),
      playlist: bool("playlist"),
      clipStart,
      clipEnd,
    },
  };
}
