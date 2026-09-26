import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { DOWNLOAD_DIR, ENGINES, MAX_CONCURRENT, META_FILE, childEnv } from "@/lib/server/config";
import { isMediaFile } from "@/lib/server/library";
import {
  NO_ENGINE_ERROR,
  PP_PREFIX,
  PROGRESS_PREFIX,
  buildDownloadArgs,
  classifyError,
  engineOrder,
  isFinalError,
} from "@/lib/server/ytdlp";
import type { DownloadRequest, EngineId, Job, JobProgress } from "@/lib/types";

const LOG_LIMIT = 300;
const FINISHED_LIMIT = 50;

const PP_LABELS: Record<string, string> = {
  Merger: "Merging video and audio",
  FFmpegMerger: "Merging video and audio",
  ExtractAudio: "Converting audio",
  FFmpegExtractAudio: "Converting audio",
  EmbedThumbnail: "Embedding thumbnail",
  FFmpegMetadata: "Writing metadata",
  Metadata: "Writing metadata",
  EmbedSubtitle: "Embedding subtitles",
  FFmpegEmbedSubtitle: "Embedding subtitles",
  SponsorBlock: "Checking SponsorBlock",
  ModifyChapters: "Removing sponsor segments",
  FFmpegVideoRemuxer: "Remuxing",
  FFmpegFixupM3u8: "Fixing container",
  FixupM3u8: "Fixing container",
  FFmpegFixupM4a: "Fixing container",
  FixupM4a: "Fixing container",
  FixupDuplicateMoov: "Fixing container",
  FFmpegCopyStream: "Copying streams",
  MoveFiles: "Finishing up",
  MoveFilesAfterDownload: "Finishing up",
};

function emptyProgress(): JobProgress {
  return {
    percent: null,
    downloadedBytes: null,
    totalBytes: null,
    speed: null,
    eta: null,
    fragmentIndex: null,
    fragmentCount: null,
    playlistIndex: null,
    playlistCount: null,
    streamKind: null,
  };
}

const num = (s: string | undefined) => {
  if (!s || s === "NA" || s === "None") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

interface Internal {
  job: Job;
  req: DownloadRequest;
  child: ChildProcess | null;
  cancelled: boolean;
  lastEmit: number;
  pendingEmit: NodeJS.Timeout | null;
}

class JobManager extends EventEmitter {
  private jobs = new Map<string, Internal>();

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  list(): Job[] {
    return [...this.jobs.values()].map((i) => i.job).sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string) {
    return this.jobs.get(id)?.job;
  }

  activeIds() {
    return new Set(
      [...this.jobs.values()]
        .filter((i) => ["queued", "running", "postprocessing"].includes(i.job.status))
        .map((i) => i.job.id),
    );
  }

  create(req: DownloadRequest): Job {
    const job: Job = {
      id: randomUUID(),
      url: req.url,
      title: req.title?.trim() || req.url,
      thumbnail: req.thumbnail ?? null,
      preset: req.preset,
      formatId: req.formatId,
      engine: req.engine,
      activeEngine: null,
      status: "queued",
      stage: "Waiting in queue",
      progress: emptyProgress(),
      error: null,
      files: [],
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      log: [],
    };
    this.jobs.set(job.id, { job, req, child: null, cancelled: false, lastEmit: 0, pendingEmit: null });
    this.emitUpdate(job.id, true);
    this.pump();
    this.prune();
    return job;
  }

  cancel(id: string) {
    const i = this.jobs.get(id);
    if (!i) return false;
    if (i.job.status === "queued") {
      i.cancelled = true;
      this.finish(i, "cancelled");
      return true;
    }
    if (i.job.status === "running" || i.job.status === "postprocessing") {
      i.cancelled = true;
      i.job.stage = "Cancelling…";
      this.emitUpdate(id, true);
      i.child?.kill("SIGTERM");
      const child = i.child;
      setTimeout(() => child && child.exitCode === null && child.kill("SIGKILL"), 4000);
      return true;
    }
    return false;
  }

  /** Removes a finished job from the list (files stay in the library). */
  dismiss(id: string) {
    const i = this.jobs.get(id);
    if (!i || ["queued", "running", "postprocessing"].includes(i.job.status)) return false;
    this.jobs.delete(id);
    this.emit("remove", id);
    return true;
  }

  retry(id: string) {
    const i = this.jobs.get(id);
    if (!i || !["failed", "cancelled"].includes(i.job.status)) return null;
    this.dismiss(id);
    return this.create(i.req);
  }

  private running() {
    return [...this.jobs.values()].filter((i) => i.job.status === "running" || i.job.status === "postprocessing")
      .length;
  }

  private pump() {
    const queued = [...this.jobs.values()]
      .filter((i) => i.job.status === "queued")
      .sort((a, b) => a.job.createdAt - b.job.createdAt);
    for (const i of queued) {
      if (this.running() >= MAX_CONCURRENT) break;
      void this.start(i);
    }
  }

  private prune() {
    const finished = [...this.jobs.values()]
      .filter((i) => ["completed", "failed", "cancelled"].includes(i.job.status))
      .sort((a, b) => b.job.createdAt - a.job.createdAt);
    for (const i of finished.slice(FINISHED_LIMIT)) this.dismiss(i.job.id);
  }

  private dir(id: string) {
    return path.join(DOWNLOAD_DIR, id);
  }

  private async start(i: Internal) {
    const { job } = i;
    const order = engineOrder(job.engine);
    job.status = "running";
    job.startedAt = Date.now();
    if (!order.length) {
      job.error = NO_ENGINE_ERROR;
      return this.finish(i, "failed");
    }
    const dir = this.dir(job.id);
    await fs.promises.mkdir(dir, { recursive: true });
    this.writeMeta(i);

    for (const engine of order) {
      if (i.cancelled) break;
      const result = await this.runEngine(i, engine, dir);
      if (result === "ok") {
        job.files = this.collectFiles(dir);
        if (!job.files.length) {
          job.error = {
            code: "unknown",
            message: "The engine finished but produced no file.",
            hint: "This can happen with live streams or DRM-protected videos.",
          };
          return this.finish(i, "failed");
        }
        this.writeMeta(i);
        return this.finish(i, "completed");
      }
      if (i.cancelled) break;
      if (job.error && isFinalError(job.error)) break;
      if (engine !== order.at(-1)) {
        this.pushLog(i, `--- ${ENGINES[engine].label} failed, retrying with ${ENGINES[order.at(-1)!].label} ---`);
      }
    }
    if (i.cancelled) return this.finish(i, "cancelled");
    this.finish(i, "failed");
  }

  private runEngine(i: Internal, engine: EngineId, dir: string): Promise<"ok" | "error"> {
    const { job } = i;
    job.activeEngine = engine;
    job.status = "running";
    job.stage = "Fetching video info";
    job.error = null;
    job.progress = emptyProgress();
    this.emitUpdate(job.id, true);

    const args = buildDownloadArgs(i.req, dir);
    return new Promise((resolve) => {
      const child = spawn(ENGINES[engine].bin, args, { env: childEnv(), cwd: dir });
      i.child = child;
      const output: string[] = [];
      const onLine = (line: string) => {
        line = line.trimEnd();
        if (!line) return;
        if (line.startsWith(PROGRESS_PREFIX)) return this.onProgress(i, line.slice(PROGRESS_PREFIX.length));
        if (line.startsWith(PP_PREFIX)) return this.onPostprocess(i, line.slice(PP_PREFIX.length));
        output.push(line);
        if (output.length > 400) output.shift();
        this.pushLog(i, line);
        this.onInfoLine(i, line);
      };
      readline.createInterface({ input: child.stdout }).on("line", onLine);
      readline.createInterface({ input: child.stderr }).on("line", onLine);
      child.on("error", (err) => {
        output.push(`ERROR: ${err.message}`);
      });
      child.on("close", (code) => {
        i.child = null;
        if (code === 0 && !i.cancelled) return resolve("ok");
        if (!i.cancelled) job.error = classifyError(output.join("\n"));
        resolve("error");
      });
    });
  }

  private onInfoLine(i: Internal, line: string) {
    const { job } = i;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\[download\] Downloading (?:item|video) (\d+) of (\d+)/))) {
      job.progress.playlistIndex = Number(m[1]);
      job.progress.playlistCount = Number(m[2]);
      this.emitUpdate(job.id, true);
    } else if ((m = line.match(/^\[info\] .*?: Downloading (\d+) format\(s\): (.+)$/))) {
      job.stage = "Starting download";
      this.emitUpdate(job.id);
    } else if (/^\[download\] .* has already been downloaded/.test(line)) {
      job.stage = "Already downloaded";
      this.emitUpdate(job.id);
    }
  }

  private onProgress(i: Internal, payload: string) {
    const [status, downloaded, total, estimate, speed, eta, fragIdx, fragCount, plIdx, plCount, vcodec, acodec] =
      payload.split("|");
    const { job } = i;
    const p = job.progress;
    p.downloadedBytes = num(downloaded);
    p.totalBytes = num(total) ?? num(estimate);
    p.speed = num(speed);
    p.eta = num(eta);
    p.fragmentIndex = num(fragIdx);
    p.fragmentCount = num(fragCount);
    p.playlistIndex = num(plIdx) ?? p.playlistIndex;
    p.playlistCount = num(plCount) ?? p.playlistCount;
    const hasV = vcodec && vcodec !== "none" && vcodec !== "NA";
    const hasA = acodec && acodec !== "none" && acodec !== "NA";
    p.streamKind = hasV && hasA ? "av" : hasV ? "video" : hasA ? "audio" : "av";
    if (p.totalBytes && p.downloadedBytes !== null) {
      p.percent = Math.min(100, (p.downloadedBytes / p.totalBytes) * 100);
    } else if (p.fragmentCount && p.fragmentIndex) {
      p.percent = Math.min(100, (p.fragmentIndex / p.fragmentCount) * 100);
    }
    if (status === "finished") p.percent = 100;
    job.status = "running";
    job.stage =
      p.streamKind === "video" ? "Downloading video" : p.streamKind === "audio" ? "Downloading audio" : "Downloading";
    this.emitUpdate(job.id, status === "finished");
  }

  private onPostprocess(i: Internal, payload: string) {
    const [status, name] = payload.split("|");
    const { job } = i;
    if (status !== "started") return;
    job.status = "postprocessing";
    job.stage = PP_LABELS[name] ?? `Processing (${name})`;
    job.progress.speed = null;
    job.progress.eta = null;
    this.emitUpdate(job.id, true);
  }

  private collectFiles(dir: string) {
    try {
      return fs
        .readdirSync(dir)
        .filter(isMediaFile)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    } catch {
      return [];
    }
  }

  private writeMeta(i: Internal) {
    const { job } = i;
    const meta = {
      id: job.id,
      url: job.url,
      title: job.title,
      thumbnail: job.thumbnail,
      preset: job.preset,
      createdAt: job.createdAt,
    };
    try {
      fs.writeFileSync(path.join(this.dir(job.id), META_FILE), JSON.stringify(meta, null, 2));
    } catch {
      /* directory may have been removed */
    }
  }

  private pushLog(i: Internal, line: string) {
    i.job.log.push(line);
    if (i.job.log.length > LOG_LIMIT) i.job.log.splice(0, i.job.log.length - LOG_LIMIT);
  }

  private finish(i: Internal, status: Job["status"]) {
    const { job } = i;
    job.status = status;
    job.finishedAt = Date.now();
    job.progress.speed = null;
    job.progress.eta = null;
    job.stage =
      status === "completed"
        ? job.files.length > 1
          ? `Saved ${job.files.length} files`
          : "Saved"
        : status === "cancelled"
          ? "Cancelled"
          : "Failed";
    if (status === "completed") job.progress.percent = 100;
    if (status !== "completed") this.cleanupPartials(job.id);
    this.emitUpdate(job.id, true);
    this.emit("finished", job);
    this.pump();
  }

  private cleanupPartials(id: string) {
    const dir = this.dir(id);
    try {
      const files = fs.readdirSync(dir);
      if (!files.some(isMediaFile)) fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* nothing to clean */
    }
  }

  private emitUpdate(id: string, force = false) {
    const i = this.jobs.get(id);
    if (!i) return;
    const now = Date.now();
    const send = () => {
      i.pendingEmit = null;
      i.lastEmit = Date.now();
      this.emit("update", i.job);
    };
    if (force || now - i.lastEmit > 250) {
      if (i.pendingEmit) clearTimeout(i.pendingEmit);
      send();
    } else if (!i.pendingEmit) {
      i.pendingEmit = setTimeout(send, 250 - (now - i.lastEmit));
    }
  }
}

const g = globalThis as unknown as { __vidgrabJobs?: JobManager };
export const jobs = g.__vidgrabJobs ?? (g.__vidgrabJobs = new JobManager());
