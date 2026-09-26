"use client";

import {
  AudioLines,
  Cookie,
  Download,
  Film,
  Layers,
  ListVideo,
  Moon,
  Scissors,
  Settings2,
  Sun,
  Trash2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useJobs } from "@/hooks/use-jobs";
import { useLocalState } from "@/hooks/use-local-state";
import { ApiError, api } from "@/lib/api";
import { extractUrls, hostOf } from "@/lib/format";
import type { EnginePref, FriendlyError, HealthInfo, Job, LibraryItem, MediaInfo, Preset } from "@/lib/types";
import { DEFAULT_OPTIONS } from "@/lib/types";
import { DownloadPanel, type DownloadChoice } from "./download-panel";
import { JobCard } from "./job-card";
import { LibraryPanel } from "./library-panel";
import { MediaCard, MediaCardSkeleton } from "./media-card";
import { SettingsDialog } from "./settings-dialog";
import { ENGINE_SHORT, ErrorCallout } from "./shared";
import { UrlBar } from "./url-bar";

interface Prefs extends DownloadChoice {
  engine: EnginePref;
}

const DEFAULT_PREFS: Prefs = {
  engine: "auto",
  mode: "video",
  videoPreset: "best",
  audioPreset: "audio-mp3",
  options: DEFAULT_OPTIONS,
};

const SAMPLES = [
  { label: "Apple HLS test stream", url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8" },
  { label: "Sample MP4 file", url: "https://download.samplelib.com/mp4/sample-5s.mp4" },
];

const FEATURES = [
  { icon: Film, title: "Up to 4K", body: "Best video and audio, merged into one file" },
  { icon: AudioLines, title: "Audio only", body: "MP3, M4A or the original stream" },
  { icon: ListVideo, title: "Playlists & batches", body: "Whole playlists, or paste many links" },
  { icon: Scissors, title: "Clip a section", body: "Grab just 1:30 → 2:45" },
];

export function VidGrabApp() {
  const [prefs, setPrefs] = useLocalState<Prefs>("vidgrab:prefs", DEFAULT_PREFS);
  const [input, setInput] = useState("");
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [batch, setBatch] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<{ error: FriendlyError; url: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [library, setLibrary] = useState<LibraryItem[] | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [tab, setTab] = useState("queue");
  const analyzeSeq = useRef(0);

  const refreshLibrary = useCallback(async () => {
    try {
      setLibrary(await api.library());
    } catch {
      /* keep previous list */
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await api.health());
    } catch {
      /* server offline; the jobs connection indicator shows this */
    }
  }, []);

  const onFinished = useCallback(
    (job: Job) => {
      const name = job.title === job.url ? (hostOf(job.url) ?? "Download") : job.title;
      if (job.status === "completed") {
        toast.success("Download complete", { description: name });
        void refreshLibrary();
      } else if (job.status === "failed") {
        toast.error(job.error?.message ?? "Download failed", { description: name });
      }
    },
    [refreshLibrary],
  );

  const { jobs, connection } = useJobs(onFinished);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void refreshLibrary();
    void refreshHealth();
  }, [refreshLibrary, refreshHealth]);

  const analyzeUrl = async (raw: string, engine: EnginePref = prefs.engine) => {
    const urls = extractUrls(raw);
    setAnalyzeError(null);
    if (urls.length > 1) {
      setInfo(null);
      setBatch(urls);
      return;
    }
    const url = urls[0] ?? raw.trim();
    setBatch([]);
    setInfo(null);
    setAnalyzing(true);
    const seq = ++analyzeSeq.current;
    try {
      const result = await api.analyze(url, engine);
      if (seq === analyzeSeq.current) setInfo(result);
    } catch (e) {
      if (seq !== analyzeSeq.current) return;
      setAnalyzeError({
        url,
        error: e instanceof ApiError ? e.error : { code: "unknown", message: "Something went wrong.", hint: "" },
      });
    } finally {
      if (seq === analyzeSeq.current) setAnalyzing(false);
    }
  };

  const startDownload = async (preset: Preset, formatId?: string) => {
    const targets = batch.length
      ? batch.map((url) => ({ url, title: undefined, thumbnail: undefined }))
      : info
        ? [{ url: info.url, title: info.title, thumbnail: info.thumbnail ?? undefined }]
        : [];
    if (!targets.length) return;
    setSubmitting(true);
    try {
      const created = await api.createJobs(
        targets.map((t) => ({
          ...t,
          preset,
          formatId,
          engine: prefs.engine,
          options: {
            ...prefs.options,
            playlist: info?.kind === "playlist" ? prefs.options.playlist : false,
            clipStart: batch.length ? "" : prefs.options.clipStart,
            clipEnd: batch.length ? "" : prefs.options.clipEnd,
          },
        })),
      );
      toast(created.length > 1 ? `Queued ${created.length} downloads` : "Download started", {
        description: created.length === 1 ? created[0].title : undefined,
      });
      setTab("queue");
      setInfo(null);
      setBatch([]);
      setInput("");
      setPrefs((p) => ({ ...p, options: { ...p.options, clipStart: "", clipEnd: "" } }));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.error.message : "Couldn't start the download");
    } finally {
      setSubmitting(false);
    }
  };

  const activeCount = jobs.filter((j) => ["queued", "running", "postprocessing"].includes(j.status)).length;
  const finishedCount = jobs.length - activeCount;
  const showHero = !info && !analyzing && !analyzeError && !batch.length;

  const jobAction = (fn: () => Promise<unknown>, failMsg: string) => async () => {
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.error.message : failMsg);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        engine={prefs.engine}
        health={health}
        connection={connection}
        activeCount={activeCount}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 pt-6 pb-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:pt-10">
        <section className="min-w-0 space-y-6">
          {showHero && (
            <div className="space-y-3 pt-2 text-center sm:pt-6 lg:text-left">
              <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-5xl">
                Grab any video, <span className="text-brand-gradient">in two clicks.</span>
              </h1>
              <p className="mx-auto max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg lg:mx-0">
                Paste a link from YouTube, Vimeo, TikTok, X, SoundCloud or 1,800+ other sites. Pick a quality, and
                it lands in your library.
              </p>
            </div>
          )}

          <UrlBar value={input} onChange={setInput} onSubmit={(v) => analyzeUrl(v)} loading={analyzing} />

          {showHero && (
            <>
              <div className="flex flex-wrap items-center justify-center gap-2 text-sm lg:justify-start">
                <span className="text-muted-foreground">Try a sample:</span>
                {SAMPLES.map((s) => (
                  <button
                    key={s.url}
                    type="button"
                    onClick={() => {
                      setInput(s.url);
                      void analyzeUrl(s.url);
                    }}
                    className="rounded-full border bg-card px-3 py-1 text-xs transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 xl:grid-cols-4">
                {FEATURES.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="rounded-xl border bg-card/60 p-4">
                    <div className="mb-3 inline-flex rounded-lg bg-primary/10 p-2 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
                  </div>
                ))}
              </div>
              {health && !health.cookies.present && (
                <p className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  <Cookie className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    YouTube often blocks cloud servers with a bot check. If a YouTube link fails,{" "}
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      add your browser cookies
                    </button>{" "}
                    or run vid-grab on your own computer.
                  </span>
                </p>
              )}
            </>
          )}

          {analyzing && (
            <Card>
              <CardContent className="space-y-4">
                <MediaCardSkeleton />
                <p className="text-sm text-muted-foreground">
                  Fetching video info
                  {prefs.engine === "auto" ? " (trying the fork first, then upstream)…" : "…"}
                </p>
              </CardContent>
            </Card>
          )}

          {analyzeError && (
            <ErrorCallout
              error={analyzeError.error}
              onRetry={() => analyzeUrl(analyzeError.url)}
              onOpenSettings={() => setSettingsOpen(true)}
              onUseUpstream={
                prefs.engine === "fork" && health?.engines.find((e) => e.id === "upstream")?.available
                  ? () => {
                      setPrefs((p) => ({ ...p, engine: "upstream" }));
                      void analyzeUrl(analyzeError.url, "upstream");
                    }
                  : undefined
              }
            />
          )}

          {(info || batch.length > 0) && (
            <Card className="overflow-visible">
              <CardContent className="space-y-6">
                {info && <MediaCard info={info} />}
                {batch.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Layers className="size-4 text-primary" />
                      <h2 className="font-semibold">{batch.length} links ready</h2>
                      <Badge variant="secondary">Batch</Badge>
                    </div>
                    <ul className="max-h-40 space-y-1 overflow-auto rounded-lg bg-muted/40 p-2 font-mono text-xs">
                      {batch.map((u) => (
                        <li key={u} className="truncate text-muted-foreground">
                          {u}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <DownloadPanel
                  key={info?.url ?? batch.join()}
                  info={info}
                  batchCount={batch.length}
                  choice={prefs}
                  onChoiceChange={(c) => setPrefs((p) => ({ ...p, ...c }))}
                  onDownload={startDownload}
                  submitting={submitting}
                />
              </CardContent>
            </Card>
          )}
        </section>

        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <Card className="gap-0 py-0">
            <Tabs value={tab} onValueChange={setTab} className="gap-0">
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <TabsList>
                  <TabsTrigger value="queue" className="gap-1.5">
                    Downloads
                    {activeCount > 0 && (
                      <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground">
                        {activeCount}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="library" className="gap-1.5">
                    Library
                    {library && library.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{library.length}</span>
                    )}
                  </TabsTrigger>
                </TabsList>
                {tab === "queue" && finishedCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={jobAction(() => api.clearJobs(), "Couldn't clear the list")}
                  >
                    <Trash2 /> Clear finished
                  </Button>
                )}
              </div>
              <TabsContent value="queue" className="max-h-[calc(100dvh-10rem)] overflow-y-auto p-3">
                {jobs.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                    <div className="rounded-full bg-muted p-4">
                      <Download className="size-6 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">Nothing downloading</p>
                      <p className="text-sm text-muted-foreground">
                        Paste a link to get started. Downloads keep running if you close this tab.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {jobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        onCancel={jobAction(() => api.cancelJob(job.id), "Couldn't cancel")}
                        onRetry={jobAction(() => api.retryJob(job.id), "Couldn't retry")}
                        onDismiss={jobAction(() => api.dismissJob(job.id), "Couldn't remove")}
                        onOpenSettings={() => setSettingsOpen(true)}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="library" className="max-h-[calc(100dvh-10rem)] overflow-y-auto p-3">
                <LibraryPanel
                  items={library}
                  loading={libraryLoading}
                  onDelete={async (item) => {
                    try {
                      await api.deleteFile(item);
                      toast("File deleted");
                    } catch (e) {
                      toast.error(e instanceof ApiError ? e.error.message : "Couldn't delete");
                    }
                    await refreshLibrary();
                  }}
                />
              </TabsContent>
            </Tabs>
          </Card>
        </aside>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Powered by{" "}
        <a href="https://github.com/grqz/yt-dlp" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          grqz/yt-dlp
        </a>{" "}
        and{" "}
        <a href="https://github.com/yt-dlp/yt-dlp" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          yt-dlp
        </a>
        . Only download content you have the right to.
      </footer>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        engine={prefs.engine}
        onEngineChange={(engine) => setPrefs((p) => ({ ...p, engine }))}
        health={health}
        onHealthChange={refreshHealth}
      />
    </div>
  );
}

function Header({
  engine,
  health,
  connection,
  activeCount,
  onOpenSettings,
}: {
  engine: EnginePref;
  health: HealthInfo | null;
  connection: "connecting" | "open" | "closed";
  activeCount: number;
  onOpenSettings: () => void;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const offline = connection === "closed";
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="bg-brand-gradient flex size-8 items-center justify-center rounded-lg text-white shadow-md shadow-primary/30">
            <Zap className="size-4 fill-current" />
          </span>
          <span className="text-lg">vid-grab</span>
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          {offline ? (
            <Badge variant="destructive">Server offline</Badge>
          ) : activeCount > 0 ? (
            <Badge variant="secondary" className="gap-1.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              {activeCount} active
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={onOpenSettings}
            className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            <span className={health?.engines.some((e) => e.available) ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-destructive"} />
            Engine: {ENGINE_SHORT[engine]}
            {health?.cookies.present && (
              <>
                <span className="text-border">|</span>
                <Cookie className="size-3" />
              </>
            )}
          </button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Sun className="hidden dark:block" />
            <Moon className="dark:hidden" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Settings" onClick={onOpenSettings}>
            <Settings2 />
          </Button>
        </div>
      </div>
    </header>
  );
}
