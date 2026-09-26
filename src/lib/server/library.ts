import fs from "node:fs";
import path from "node:path";
import { DOWNLOAD_DIR, META_FILE } from "@/lib/server/config";
import type { LibraryItem } from "@/lib/types";

const VIDEO_EXT = new Set(["mp4", "mkv", "webm", "mov", "avi", "flv", "m4v", "ts", "3gp"]);
const AUDIO_EXT = new Set(["mp3", "m4a", "aac", "opus", "ogg", "flac", "wav", "alac", "vorbis", "weba"]);
const SKIP_EXT = new Set(["part", "ytdl", "tmp", "temp", "json", "vtt", "srt", "ass", "jpg", "jpeg", "png", "webp", "description"]);

const JOB_ID = /^[0-9a-f-]{36}$/;

export function isMediaFile(name: string) {
  if (name.startsWith(".")) return false;
  if (/\.part(-Frag\d+)?$|\]\.f[\w-]+\.\w+$|\.temp\.\w+$/.test(name)) return false;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return !SKIP_EXT.has(ext);
}

function kindOf(ext: string): LibraryItem["kind"] {
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  return "other";
}

interface Meta {
  url?: string;
  title?: string;
  thumbnail?: string | null;
  createdAt?: number;
}

function readMeta(dir: string): Meta {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, META_FILE), "utf8"));
  } catch {
    return {};
  }
}

export async function listLibrary(exclude: Set<string>): Promise<LibraryItem[]> {
  let dirs: string[] = [];
  try {
    dirs = await fs.promises.readdir(DOWNLOAD_DIR);
  } catch {
    return [];
  }
  const items: LibraryItem[] = [];
  for (const jobId of dirs) {
    if (!JOB_ID.test(jobId) || exclude.has(jobId)) continue;
    const dir = path.join(DOWNLOAD_DIR, jobId);
    let names: string[];
    try {
      names = (await fs.promises.readdir(dir)).filter(isMediaFile);
    } catch {
      continue;
    }
    const meta = readMeta(dir);
    for (const name of names) {
      const stat = await fs.promises.stat(path.join(dir, name)).catch(() => null);
      if (!stat?.isFile()) continue;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      items.push({
        id: `${jobId}/${name}`,
        jobId,
        name,
        size: stat.size,
        ext,
        kind: kindOf(ext),
        title: names.length > 1 ? name.replace(/\.[^.]+$/, "") : (meta.title ?? name),
        url: meta.url ?? null,
        thumbnail: meta.thumbnail ?? null,
        createdAt: stat.mtimeMs || meta.createdAt || 0,
      });
    }
  }
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

/** Resolves a library file path, rejecting anything outside the download directory. */
export function resolveLibraryFile(jobId: string, name: string): string | null {
  if (!JOB_ID.test(jobId)) return null;
  if (!name || name.includes("/") || name.includes("\\") || name.startsWith(".")) return null;
  const full = path.resolve(DOWNLOAD_DIR, jobId, name);
  if (!full.startsWith(path.join(DOWNLOAD_DIR, jobId) + path.sep)) return null;
  return fs.existsSync(full) ? full : null;
}

export async function deleteLibraryFile(jobId: string, name: string) {
  const full = resolveLibraryFile(jobId, name);
  if (!full) return false;
  await fs.promises.rm(full, { force: true });
  const dir = path.dirname(full);
  const rest = (await fs.promises.readdir(dir).catch(() => [])).filter(isMediaFile);
  if (!rest.length) await fs.promises.rm(dir, { recursive: true, force: true });
  return true;
}

export async function libraryUsage() {
  const items = await listLibrary(new Set());
  return { count: items.length, bytes: items.reduce((s, i) => s + i.size, 0) };
}
