"use client";

import { Ban, CheckCircle2, ChevronDown, Download, Loader2, RotateCw, Terminal, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fileUrl } from "@/lib/api";
import { formatBytes, formatEta, formatSpeed, hostOf } from "@/lib/format";
import type { Job } from "@/lib/types";
import { isAudioPreset } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ENGINE_SHORT, ErrorCallout, PRESET_LABELS, Thumb } from "./shared";

export function JobCard({
  job,
  onCancel,
  onRetry,
  onDismiss,
  onOpenSettings,
}: {
  job: Job;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
  onOpenSettings: () => void;
}) {
  const [showLog, setShowLog] = useState(false);
  const p = job.progress;
  const active = job.status === "queued" || job.status === "running" || job.status === "postprocessing";
  const indeterminate = job.status === "postprocessing" || (job.status === "running" && p.percent == null);
  const detail = [
    p.downloadedBytes != null && p.totalBytes
      ? `${formatBytes(p.downloadedBytes)} of ${formatBytes(p.totalBytes)}`
      : p.downloadedBytes
        ? formatBytes(p.downloadedBytes)
        : null,
    formatSpeed(p.speed),
    formatEta(p.eta),
  ].filter(Boolean);
  const title = job.title === job.url ? (hostOf(job.url) ?? job.url) : job.title;

  return (
    <div
      className={cn(
        "group rounded-xl border bg-card p-3 transition-colors",
        job.status === "completed" && "border-success/30",
        job.status === "failed" && "border-destructive/30",
      )}
    >
      <div className="flex gap-3">
        <Thumb
          src={job.thumbnail}
          kind={isAudioPreset(job.preset) ? "audio" : "video"}
          className="aspect-video w-20 self-start"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="line-clamp-2 flex-1 text-sm leading-snug font-medium" title={job.title}>
              {title}
            </p>
            {active ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onCancel}
                aria-label="Cancel download"
                className="-mt-1 -mr-1 text-muted-foreground"
              >
                <Ban />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDismiss}
                aria-label="Remove from list"
                className="-mt-1 -mr-1 text-muted-foreground opacity-60 group-hover:opacity-100"
              >
                <X />
              </Button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{job.formatId ? `Format ${job.formatId}` : PRESET_LABELS[job.preset]}</span>
            {job.activeEngine && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                {ENGINE_SHORT[job.activeEngine]}
              </Badge>
            )}
            {p.playlistIndex && p.playlistCount && active && (
              <span>
                · Item {p.playlistIndex} of {p.playlistCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {active && (
        <div className="mt-3 space-y-1.5">
          {job.status === "queued" ? (
            <Progress value={0} className="h-1.5" />
          ) : indeterminate ? (
            <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="animate-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-primary" />
            </div>
          ) : (
            <Progress value={p.percent ?? 0} className="h-1.5" />
          )}
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">
              {job.status !== "queued" && <Loader2 className="size-3 shrink-0 animate-spin" />}
              <span className="truncate">
                {job.stage}
                {detail.length > 0 && job.status === "running" && ` · ${detail.join(" · ")}`}
              </span>
            </span>
            {p.percent != null && job.status === "running" && (
              <span className="font-mono font-medium tabular-nums">{Math.floor(p.percent)}%</span>
            )}
          </div>
        </div>
      )}

      {job.status === "completed" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
            <CheckCircle2 className="size-3.5" /> {job.stage}
          </span>
          {job.files.length === 1 && (
            <Button size="sm" variant="secondary" asChild>
              <a href={fileUrl({ jobId: job.id, name: job.files[0] })} download>
                <Download /> Save to device
              </a>
            </Button>
          )}
        </div>
      )}

      {job.status === "cancelled" && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Cancelled</span>
          <Button size="sm" variant="ghost" onClick={onRetry}>
            <RotateCw /> Restart
          </Button>
        </div>
      )}

      {job.status === "failed" && job.error && (
        <div className="mt-3">
          <ErrorCallout compact error={job.error} onRetry={onRetry} onOpenSettings={onOpenSettings} />
        </div>
      )}

      {job.log.length > 0 && (job.status === "failed" || showLog) && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Terminal className="size-3" /> {showLog ? "Hide" : "Show"} engine log
            <ChevronDown className={cn("size-3 transition-transform", showLog && "rotate-180")} />
          </button>
          {showLog && (
            <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
              {job.log.slice(-80).join("\n")}
            </pre>
          )}
        </div>
      )}
      {job.log.length > 0 && job.status !== "failed" && !showLog && (
        <button
          type="button"
          onClick={() => setShowLog(true)}
          className="mt-2 hidden items-center gap-1 text-xs text-muted-foreground hover:text-foreground group-hover:inline-flex"
        >
          <Terminal className="size-3" /> Show engine log
        </button>
      )}
    </div>
  );
}
