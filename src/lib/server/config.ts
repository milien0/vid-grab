import os from "node:os";
import path from "node:path";
import type { EngineId } from "@/lib/types";

const ROOT = process.cwd();

export const DOWNLOAD_DIR = path.resolve(process.env.VIDGRAB_DOWNLOAD_DIR ?? path.join(ROOT, "downloads"));
export const DATA_DIR = path.resolve(process.env.VIDGRAB_DATA_DIR ?? path.join(ROOT, "data"));
export const COOKIES_FILE = path.join(DATA_DIR, "cookies.txt");
export const MAX_CONCURRENT = Math.max(1, Number(process.env.VIDGRAB_MAX_CONCURRENT ?? 2));
export const META_FILE = ".vidgrab.json";

export const ENGINES: Record<EngineId, { label: string; bin: string }> = {
  fork: {
    label: "grqz/yt-dlp (fork)",
    bin: process.env.VIDGRAB_FORK_BIN ?? path.join(ROOT, ".venv", "bin", "yt-dlp"),
  },
  upstream: {
    label: "yt-dlp (upstream)",
    bin: process.env.VIDGRAB_UPSTREAM_BIN ?? path.join(ROOT, ".venv-upstream", "bin", "yt-dlp"),
  },
};

export function childEnv(): NodeJS.ProcessEnv {
  const deno = path.join(os.homedir(), ".deno", "bin");
  return {
    ...process.env,
    PATH: `${deno}${path.delimiter}${process.env.PATH ?? ""}`,
    PYTHONUNBUFFERED: "1",
    PYTHONIOENCODING: "utf-8",
  };
}
