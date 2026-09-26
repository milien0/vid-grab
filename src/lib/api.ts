import type {
  CookieStatus,
  DownloadRequest,
  FriendlyError,
  HealthInfo,
  Job,
  LibraryItem,
  MediaInfo,
  EnginePref,
} from "@/lib/types";

export class ApiError extends Error {
  constructor(public error: FriendlyError) {
    super(error.message);
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new ApiError({
      code: "network",
      message: "Can't reach the vid-grab server.",
      hint: "Make sure `npm run dev` is still running.",
    });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(
      typeof e === "object" && e
        ? { code: e.code ?? "unknown", message: e.message ?? "Request failed", hint: e.hint ?? "", raw: e.raw }
        : { code: "unknown", message: typeof e === "string" ? e : `Request failed (${res.status})`, hint: "" },
    );
  }
  return data as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  analyze: (url: string, engine: EnginePref) =>
    request<{ info: MediaInfo }>("/api/analyze", json({ url, engine })).then((r) => r.info),
  createJobs: (items: DownloadRequest[]) => request<{ jobs: Job[] }>("/api/jobs", json({ items })).then((r) => r.jobs),
  cancelJob: (id: string) => request("/api/jobs/" + id, json({ action: "cancel" })),
  retryJob: (id: string) => request<{ job: Job }>("/api/jobs/" + id, json({ action: "retry" })),
  dismissJob: (id: string) => request("/api/jobs/" + id, { method: "DELETE" }),
  clearJobs: () => request("/api/jobs", { method: "DELETE" }),
  library: () => request<{ items: LibraryItem[] }>("/api/library").then((r) => r.items),
  deleteFile: (item: LibraryItem) => request(fileUrl(item), { method: "DELETE" }),
  health: () => request<HealthInfo>("/api/health"),
  saveCookies: (text: string) =>
    request<{ cookies: CookieStatus }>("/api/cookies", { method: "POST", body: text }).then((r) => r.cookies),
  deleteCookies: () => request<{ cookies: CookieStatus }>("/api/cookies", { method: "DELETE" }).then((r) => r.cookies),
};

export function fileUrl(item: Pick<LibraryItem, "jobId" | "name">, inline = false) {
  return `/api/files/${item.jobId}/${encodeURIComponent(item.name)}${inline ? "?inline=1" : ""}`;
}
