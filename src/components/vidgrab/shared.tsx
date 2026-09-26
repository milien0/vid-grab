"use client";

import { AlertTriangle, FileAudio, FileVideo, Film, RotateCw, Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EngineId, EnginePref, FriendlyError, Preset } from "@/lib/types";

export const PRESET_LABELS: Record<Preset, string> = {
  best: "Best quality",
  "2160": "4K (2160p)",
  "1440": "1440p",
  "1080": "1080p",
  "720": "720p",
  "480": "480p",
  "360": "360p",
  "audio-mp3": "MP3 audio",
  "audio-m4a": "M4A audio",
  "audio-best": "Original audio",
  custom: "Custom format",
};

export const ENGINE_SHORT: Record<EngineId | EnginePref, string> = {
  auto: "Auto",
  fork: "Fork",
  upstream: "Upstream",
};

export function Thumb({
  src,
  kind = "video",
  className,
  children,
}: {
  src: string | null | undefined;
  kind?: "video" | "audio" | "other";
  className?: string;
  children?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = kind === "audio" ? FileAudio : kind === "video" ? FileVideo : Film;
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-md bg-muted", className)}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnails come from arbitrary video hosts
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-muted to-secondary text-muted-foreground">
          <Icon className="size-1/3 min-h-4 min-w-4" />
        </div>
      )}
      {children}
    </div>
  );
}

export function ErrorCallout({
  error,
  onRetry,
  onOpenSettings,
  onUseUpstream,
  compact,
}: {
  error: FriendlyError;
  onRetry?: () => void;
  onOpenSettings?: () => void;
  onUseUpstream?: () => void;
  compact?: boolean;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const needsCookies = error.code === "bot-check" || error.code === "login-required";
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-destructive/30 bg-destructive/5 text-sm",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-foreground">{error.message}</p>
          {error.hint && <p className="text-muted-foreground">{error.hint}</p>}
          {error.raw && (
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {showRaw ? "Hide details" : "Show details"}
            </button>
          )}
          {showRaw && error.raw && (
            <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-background/60 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
              {error.raw}
            </pre>
          )}
          {(onRetry || (needsCookies && onOpenSettings) || onUseUpstream) && (
            <div className="flex flex-wrap gap-2 pt-2">
              {needsCookies && onOpenSettings && (
                <Button size="sm" onClick={onOpenSettings}>
                  <Settings2 /> Add cookies
                </Button>
              )}
              {onUseUpstream && (
                <Button size="sm" variant="secondary" onClick={onUseUpstream}>
                  Use upstream engine
                </Button>
              )}
              {onRetry && (
                <Button size="sm" variant="outline" onClick={onRetry}>
                  <RotateCw /> Try again
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
