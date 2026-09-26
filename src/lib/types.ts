export type EngineId = "fork" | "upstream";
export type EnginePref = "auto" | EngineId;

export type Preset =
  | "best"
  | "2160"
  | "1440"
  | "1080"
  | "720"
  | "480"
  | "360"
  | "audio-mp3"
  | "audio-m4a"
  | "audio-best"
  | "custom";

export const VIDEO_PRESETS = ["best", "2160", "1440", "1080", "720", "480", "360"] as const;
export const AUDIO_PRESETS = ["audio-mp3", "audio-m4a", "audio-best"] as const;

export function isAudioPreset(p: Preset) {
  return p.startsWith("audio-");
}

export interface DownloadOptions {
  embedMetadata: boolean;
  embedThumbnail: boolean;
  embedSubs: boolean;
  subLangs: string;
  sponsorBlock: boolean;
  playlist: boolean;
  clipStart: string;
  clipEnd: string;
}

export const DEFAULT_OPTIONS: DownloadOptions = {
  embedMetadata: true,
  embedThumbnail: true,
  embedSubs: false,
  subLangs: "en.*",
  sponsorBlock: false,
  playlist: true,
  clipStart: "",
  clipEnd: "",
};

export interface DownloadRequest {
  url: string;
  preset: Preset;
  formatId?: string;
  options: DownloadOptions;
  engine: EnginePref;
  title?: string;
  thumbnail?: string;
}

export type JobStatus =
  | "queued"
  | "running"
  | "postprocessing"
  | "completed"
  | "failed"
  | "cancelled";

export type StreamKind = "video" | "audio" | "av" | null;

export interface JobProgress {
  percent: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  speed: number | null;
  eta: number | null;
  fragmentIndex: number | null;
  fragmentCount: number | null;
  playlistIndex: number | null;
  playlistCount: number | null;
  streamKind: StreamKind;
}

export type ErrorCode =
  | "bot-check"
  | "login-required"
  | "unsupported"
  | "unavailable"
  | "format"
  | "forbidden"
  | "geo"
  | "extractor-broken"
  | "engine-missing"
  | "network"
  | "unknown";

export interface FriendlyError {
  code: ErrorCode;
  message: string;
  hint: string;
  raw?: string;
}

export interface Job {
  id: string;
  url: string;
  title: string;
  thumbnail: string | null;
  preset: Preset;
  formatId?: string;
  engine: EnginePref;
  activeEngine: EngineId | null;
  status: JobStatus;
  stage: string;
  progress: JobProgress;
  error: FriendlyError | null;
  files: string[];
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  log: string[];
}

export interface FormatInfo {
  id: string;
  ext: string;
  kind: "video" | "audio" | "av";
  height: number | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  abr: number | null;
  tbr: number | null;
  filesize: number | null;
  note: string;
}

export interface VideoInfo {
  kind: "video";
  engine: EngineId;
  id: string;
  url: string;
  title: string;
  uploader: string | null;
  channelUrl: string | null;
  duration: number | null;
  thumbnail: string | null;
  viewCount: number | null;
  uploadDate: string | null;
  extractor: string;
  isLive: boolean;
  heights: number[];
  formats: FormatInfo[];
  subtitleLangs: string[];
}

export interface PlaylistEntry {
  id: string;
  title: string;
  duration: number | null;
  url: string | null;
}

export interface PlaylistInfo {
  kind: "playlist";
  engine: EngineId;
  id: string;
  url: string;
  title: string;
  uploader: string | null;
  thumbnail: string | null;
  extractor: string;
  count: number;
  entries: PlaylistEntry[];
}

export type MediaInfo = VideoInfo | PlaylistInfo;

export interface LibraryItem {
  id: string;
  jobId: string;
  name: string;
  size: number;
  ext: string;
  kind: "video" | "audio" | "other";
  title: string;
  url: string | null;
  thumbnail: string | null;
  createdAt: number;
}

export interface EngineStatus {
  id: EngineId;
  label: string;
  available: boolean;
  version: string | null;
  path: string;
}

export interface HealthInfo {
  engines: EngineStatus[];
  ffmpeg: string | null;
  deno: string | null;
  cookies: CookieStatus;
  downloadDir: string;
  maxConcurrent: number;
}

export interface CookieStatus {
  present: boolean;
  entries: number;
  domains: string[];
  updatedAt: number | null;
}
