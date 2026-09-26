import fs from "node:fs";
import { COOKIES_FILE, DATA_DIR } from "@/lib/server/config";
import type { CookieStatus } from "@/lib/types";

const HEADER = "# Netscape HTTP Cookie File";

function parse(text: string) {
  const domains = new Set<string>();
  let entries = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.startsWith("#HttpOnly_") ? raw.slice("#HttpOnly_".length) : raw;
    if (!line.trim() || line.startsWith("#")) continue;
    const cols = line.split("\t");
    if (cols.length < 7) continue;
    entries++;
    domains.add(cols[0].replace(/^\./, ""));
  }
  return { entries, domains: [...domains].sort() };
}

export function cookieStatus(): CookieStatus {
  try {
    const stat = fs.statSync(COOKIES_FILE);
    const { entries, domains } = parse(fs.readFileSync(COOKIES_FILE, "utf8"));
    return { present: true, entries, domains, updatedAt: stat.mtimeMs };
  } catch {
    return { present: false, entries: 0, domains: [], updatedAt: null };
  }
}

export function saveCookies(text: string): { ok: true; status: CookieStatus } | { ok: false; error: string } {
  const { entries } = parse(text);
  if (!entries) {
    return {
      ok: false,
      error: "No cookies found. Export them in Netscape cookies.txt format (7 tab-separated columns per line).",
    };
  }
  const body = text.trimStart().startsWith("# Netscape") || text.trimStart().startsWith("# HTTP")
    ? text
    : `${HEADER}\n${text}`;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(COOKIES_FILE, body.endsWith("\n") ? body : `${body}\n`, { mode: 0o600 });
  return { ok: true, status: cookieStatus() };
}

export function deleteCookies() {
  fs.rmSync(COOKIES_FILE, { force: true });
}
