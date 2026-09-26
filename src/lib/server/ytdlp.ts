import { spawn } from "node:child_process";
import fs from "node:fs";
import { COOKIES_FILE, ENGINES, childEnv } from "@/lib/server/config";
import type {
  DownloadRequest,
  EngineId,
  EnginePref,
  EngineStatus,
  FormatInfo,
  FriendlyError,
  MediaInfo,
  PlaylistInfo,
  VideoInfo,
} from "@/lib/types";
import { isAudioPreset } from "@/lib/types";

export const PROGRESS_PREFIX = "[vg] ";
export const PP_PREFIX = "[vgpp] ";

const PROGRESS_TEMPLATE =
  "download:" +
  PROGRESS_PREFIX +
  [
    "status",
    "downloaded_bytes",
    "total_bytes",
    "total_bytes_estimate",
    "speed",
    "eta",
    "fragment_index",
    "fragment_count",
  ]
    .map((k) => `%(progress.${k})s`)
    .concat(["%(info.playlist_index)s", "%(info.n_entries)s", "%(info.vcodec)s", "%(info.acodec)s"])
    .join("|");

const PP_TEMPLATE = `postprocess:${PP_PREFIX}%(progress.status)s|%(progress.postprocessor)s`;

export function engineAvailable(id: EngineId) {
  try {
    fs.accessSync(ENGINES[id].bin, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Engines to try, in order, for a given preference. */
export function engineOrder(pref: EnginePref): EngineId[] {
  const order: EngineId[] = pref === "auto" ? ["fork", "upstream"] : [pref];
  return order.filter(engineAvailable);
}

export function cookiesArgs(): string[] {
  return fs.existsSync(COOKIES_FILE) ? ["--cookies", COOKIES_FILE] : [];
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export function runCapture(bin: string, args: string[], timeoutMs = 90_000): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { env: childEnv() });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(err) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

const versionCache = new Map<string, string | null>();

async function binVersion(bin: string, args: string[], key: string) {
  if (versionCache.has(key)) return versionCache.get(key)!;
  const r = await runCapture(bin, args, 15_000);
  const v = r.code === 0 ? r.stdout.trim().split("\n")[0] : null;
  versionCache.set(key, v);
  return v;
}

export async function engineStatuses(): Promise<EngineStatus[]> {
  return Promise.all(
    (Object.keys(ENGINES) as EngineId[]).map(async (id) => {
      const available = engineAvailable(id);
      return {
        id,
        label: ENGINES[id].label,
        available,
        version: available ? await binVersion(ENGINES[id].bin, ["--version"], id) : null,
        path: ENGINES[id].bin,
      };
    }),
  );
}

export async function toolVersions() {
  const env = childEnv();
  const which = (name: string) =>
    (env.PATH ?? "")
      .split(":")
      .map((d) => `${d}/${name}`)
      .find((p) => fs.existsSync(p));
  const ffmpegBin = which("ffmpeg");
  const denoBin = which("deno");
  const ffmpeg = ffmpegBin ? await binVersion(ffmpegBin, ["-version"], "ffmpeg") : null;
  const deno = denoBin ? await binVersion(denoBin, ["--version"], "deno") : null;
  return {
    ffmpeg: ffmpeg?.match(/ffmpeg version (\S+)/)?.[1] ?? null,
    deno: deno?.match(/deno (\S+)/)?.[1] ?? null,
  };
}

const ERROR_RULES: { code: FriendlyError["code"]; test: RegExp; message: string; hint: string }[] = [
  {
    code: "bot-check",
    test: /confirm you.?re not a bot|Sign in to confirm/i,
    message: "YouTube is asking this server to prove it isn't a bot.",
    hint: "YouTube blocks most cloud and datacenter IPs. Add cookies from a logged-in browser in Settings, or run vid-grab from your home connection.",
  },
  {
    code: "login-required",
    test: /Private video|members.only|join this channel|Sign in to confirm your age|age.restricted|login required|requires authentication|only works when logged-in|account credentials/i,
    message: "This video needs you to be signed in.",
    hint: "Upload a cookies.txt from a browser where you're logged in (Settings → Cookies).",
  },
  {
    code: "geo",
    test: /not available in your country|geo.?restrict/i,
    message: "This video is blocked in the server's region.",
    hint: "Run vid-grab from a location where the video is available.",
  },
  {
    code: "unsupported",
    test: /Unsupported URL/i,
    message: "That link isn't a supported video page.",
    hint: "Paste the link to the video page itself, not a search or home page.",
  },
  {
    code: "format",
    test: /Requested format is not available/i,
    message: "The selected quality isn't available for this video.",
    hint: "Pick a lower quality or \"Best available\".",
  },
  {
    code: "extractor-broken",
    test: /report this issue|KeyError|TypeError|list index out of range|Unable to extract|extractor error/i,
    message: "The engine couldn't understand this site's page.",
    hint: "The site probably changed since this engine was released. Switch the engine to upstream yt-dlp in Settings.",
  },
  {
    code: "unavailable",
    test: /Video unavailable|This video is unavailable|has been removed|HTTP Error 404|does not exist/i,
    message: "This video is unavailable.",
    hint: "It may be private, deleted, or blocked for this server. Double-check the link.",
  },
  {
    code: "forbidden",
    test: /HTTP Error 403|Forbidden/i,
    message: "The site refused the request (HTTP 403).",
    hint: "Try again with cookies, or switch the engine to upstream yt-dlp in Settings.",
  },
  {
    code: "network",
    test: /timed out|Temporary failure in name resolution|Connection refused|Network is unreachable|getaddrinfo/i,
    message: "Couldn't reach the site.",
    hint: "Check the server's internet connection and try again.",
  },
];

export function classifyError(output: string): FriendlyError {
  const errorLines = output
    .split("\n")
    .filter((l) => l.startsWith("ERROR:"))
    .map((l) => l.replace(/^ERROR:\s*/, ""));
  const focus = errorLines.length ? errorLines.join("\n") : output;
  const raw = (errorLines.at(-1) ?? output.trim().split("\n").at(-1) ?? "").slice(0, 600);
  for (const rule of ERROR_RULES) {
    if (rule.test.test(focus)) return { code: rule.code, message: rule.message, hint: rule.hint, raw };
  }
  return {
    code: "unknown",
    message: "The download failed.",
    hint: "See the log for details, or try the other engine in Settings.",
    raw,
  };
}

export const NO_ENGINE_ERROR: FriendlyError = {
  code: "engine-missing",
  message: "No yt-dlp engine is installed.",
  hint: "Run ./setup.sh --with-upstream in the project folder, then restart vid-grab.",
};

/** Errors where another engine won't help. */
export function isFinalError(e: FriendlyError) {
  return e.code === "unsupported" || e.code === "network";
}

function formatKind(f: { vcodec?: string; acodec?: string }): FormatInfo["kind"] | null {
  const v = f.vcodec && f.vcodec !== "none";
  const a = f.acodec && f.acodec !== "none";
  if (v && a) return "av";
  if (v) return "video";
  if (a) return "audio";
  if (f.vcodec === undefined && f.acodec === undefined) return "av";
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toVideoInfo(j: any, engine: EngineId, url: string): VideoInfo {
  const formats: FormatInfo[] = (j.formats ?? [])
    .filter((f: any) => f.protocol !== "mhtml" && f.format_id)
    .map((f: any) => {
      const kind = formatKind(f);
      if (!kind) return null;
      return {
        id: String(f.format_id),
        ext: f.ext ?? "?",
        kind,
        height: typeof f.height === "number" ? f.height : null,
        fps: typeof f.fps === "number" ? Math.round(f.fps) : null,
        vcodec: f.vcodec && f.vcodec !== "none" ? f.vcodec : null,
        acodec: f.acodec && f.acodec !== "none" ? f.acodec : null,
        abr: typeof f.abr === "number" ? f.abr : null,
        tbr: typeof f.tbr === "number" ? f.tbr : null,
        filesize: f.filesize ?? f.filesize_approx ?? null,
        note: f.format_note ?? f.format ?? "",
      } satisfies FormatInfo;
    })
    .filter(Boolean);
  const heights = [...new Set(formats.filter((f) => f.kind !== "audio" && f.height).map((f) => f.height!))].sort(
    (a, b) => b - a,
  );
  const subs = { ...(j.subtitles ?? {}) };
  return {
    kind: "video",
    engine,
    id: String(j.id ?? ""),
    url: j.webpage_url ?? url,
    title: j.title ?? j.id ?? "Untitled",
    uploader: j.uploader ?? j.channel ?? j.uploader_id ?? null,
    channelUrl: j.channel_url ?? j.uploader_url ?? null,
    duration: typeof j.duration === "number" ? j.duration : null,
    thumbnail: j.thumbnail ?? j.thumbnails?.at?.(-1)?.url ?? null,
    viewCount: typeof j.view_count === "number" ? j.view_count : null,
    uploadDate: j.upload_date ?? null,
    extractor: j.extractor_key ?? j.extractor ?? "generic",
    isLive: Boolean(j.is_live),
    heights,
    formats,
    subtitleLangs: Object.keys(subs).filter((l) => l !== "live_chat"),
  };
}

function toPlaylistInfo(j: any, engine: EngineId, url: string): PlaylistInfo {
  const entries = (j.entries ?? []).filter(Boolean).map((e: any) => ({
    id: String(e.id ?? ""),
    title: e.title ?? e.id ?? "Untitled",
    duration: typeof e.duration === "number" ? e.duration : null,
    url: e.url ?? e.webpage_url ?? null,
  }));
  const thumbs = j.thumbnails ?? [];
  return {
    kind: "playlist",
    engine,
    id: String(j.id ?? ""),
    url: j.webpage_url ?? url,
    title: j.title ?? "Playlist",
    uploader: j.uploader ?? j.channel ?? null,
    thumbnail: thumbs.at?.(-1)?.url ?? j.entries?.[0]?.thumbnails?.at?.(-1)?.url ?? null,
    extractor: j.extractor_key ?? j.extractor ?? "generic",
    count: j.playlist_count ?? entries.length,
    entries,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type AnalyzeResult = { ok: true; info: MediaInfo } | { ok: false; error: FriendlyError; tried: EngineId[] };

export async function analyze(url: string, pref: EnginePref): Promise<AnalyzeResult> {
  const order = engineOrder(pref);
  if (!order.length) return { ok: false, error: NO_ENGINE_ERROR, tried: [] };
  let lastError: FriendlyError = NO_ENGINE_ERROR;
  const tried: EngineId[] = [];
  for (const engine of order) {
    tried.push(engine);
    const args = [
      "--ignore-config",
      "--no-warnings",
      "--dump-single-json",
      "--flat-playlist",
      "--no-colors",
      ...cookiesArgs(),
      "--",
      url,
    ];
    const r = await runCapture(ENGINES[engine].bin, args);
    if (r.code === 0 && r.stdout.trim()) {
      try {
        const j = JSON.parse(r.stdout);
        const isPlaylist = j._type === "playlist" || (Array.isArray(j.entries) && !j.formats);
        return {
          ok: true,
          info: isPlaylist ? toPlaylistInfo(j, engine, url) : toVideoInfo(j, engine, url),
        };
      } catch {
        lastError = classifyError("ERROR: Unable to extract: invalid JSON from engine");
        continue;
      }
    }
    lastError = classifyError(r.stderr || r.stdout);
    if (isFinalError(lastError)) break;
  }
  return { ok: false, error: lastError, tried };
}

function clipSection(start: string, end: string) {
  const s = start.trim() || "0";
  const e = end.trim() || "inf";
  if (s === "0" && e === "inf") return null;
  return `*${s}-${e}`;
}

export function buildDownloadArgs(req: DownloadRequest, dir: string): string[] {
  const { options: o } = req;
  const args = [
    "--ignore-config",
    "--newline",
    "--no-colors",
    "--progress-template",
    PROGRESS_TEMPLATE,
    "--progress-template",
    PP_TEMPLATE,
    "--paths",
    dir,
    "--no-mtime",
  ];

  if (o.playlist) {
    args.push("--yes-playlist", "-o", "%(playlist_index|)s%(playlist_index& - |)s%(title).150B [%(id)s].%(ext)s");
  } else {
    args.push("--no-playlist", "-o", "%(title).180B [%(id)s].%(ext)s");
  }

  const audio = isAudioPreset(req.preset);
  switch (req.preset) {
    case "audio-mp3":
      args.push("-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0");
      break;
    case "audio-m4a":
      args.push("-f", "ba[ext=m4a]/ba/b", "-x", "--audio-format", "m4a");
      break;
    case "audio-best":
      args.push("-f", "ba/b", "-x");
      break;
    case "custom":
      if (req.formatId && /^[\w.+\-/]+$/.test(req.formatId)) {
        args.push("-f", `${req.formatId}+ba/${req.formatId}`, "--merge-output-format", "mp4/mkv");
      } else {
        args.push("-f", "bv*+ba/b", "-S", "res,ext:mp4:m4a", "--merge-output-format", "mp4/mkv");
      }
      break;
    case "best":
      args.push("-f", "bv*+ba/b", "-S", "res,ext:mp4:m4a", "--merge-output-format", "mp4/mkv");
      break;
    default:
      args.push("-f", "bv*+ba/b", "-S", `res:${req.preset},ext:mp4:m4a`, "--merge-output-format", "mp4/mkv");
  }

  if (o.embedMetadata) args.push("--embed-metadata");
  if (o.embedThumbnail) args.push("--embed-thumbnail");
  if (o.embedSubs && !audio) {
    const langs = o.subLangs.trim().replace(/[^\w.*,\-]/g, "") || "en.*";
    args.push("--embed-subs", "--write-subs", "--write-auto-subs", "--sub-langs", langs);
  }
  if (o.sponsorBlock) args.push("--sponsorblock-remove", "sponsor,selfpromo,interaction");

  const section = clipSection(o.clipStart, o.clipEnd);
  if (section) args.push("--download-sections", section);

  args.push(...cookiesArgs(), "--", req.url);
  return args;
}
