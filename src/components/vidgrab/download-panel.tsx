"use client";

import { ChevronDown, Download, Music, Scissors, Video } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatBytes } from "@/lib/format";
import type { DownloadOptions, FormatInfo, MediaInfo, Preset, VideoInfo } from "@/lib/types";
import { AUDIO_PRESETS, VIDEO_PRESETS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PRESET_LABELS } from "./shared";

export interface DownloadChoice {
  mode: "video" | "audio";
  videoPreset: Preset;
  audioPreset: Preset;
  options: DownloadOptions;
}

const QUALITY_NOTE: Partial<Record<Preset, string>> = {
  "2160": "Ultra HD",
  "1440": "Quad HD",
  "1080": "Full HD",
  "720": "HD",
  "480": "SD",
  "360": "Data saver",
};

const AUDIO_NOTE: Record<string, string> = {
  "audio-mp3": "Plays everywhere",
  "audio-m4a": "Smaller, AAC",
  "audio-best": "No re-encoding",
};

function pickHeight(heights: number[], preset: Preset) {
  if (preset === "best") return heights[0] ?? null;
  const cap = Number(preset);
  return heights.find((h) => h <= cap) ?? null;
}

function bestAudio(formats: FormatInfo[]) {
  const audio = formats.filter((f) => f.kind === "audio");
  return audio.sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))[0] ?? null;
}

function estimateSize(info: VideoInfo, mode: "video" | "audio", preset: Preset, formatId: string) {
  const f = info.formats;
  if (formatId) {
    const chosen = f.find((x) => x.id === formatId);
    if (!chosen?.filesize) return null;
    return chosen.filesize + (chosen.kind === "video" ? (bestAudio(f)?.filesize ?? 0) : 0);
  }
  const audio = bestAudio(f);
  if (mode === "audio") return audio?.filesize ?? null;
  const h = pickHeight(info.heights, preset);
  const candidates = f
    .filter((x) => x.kind !== "audio" && x.height === h && x.filesize)
    .sort((a, b) => Number(b.ext === "mp4") - Number(a.ext === "mp4") || (b.tbr ?? 0) - (a.tbr ?? 0));
  const v = candidates[0];
  if (!v?.filesize) return null;
  return v.filesize + (v.kind === "video" ? (audio?.filesize ?? 0) : 0);
}

function formatLabel(f: FormatInfo) {
  const parts: string[] = [];
  if (f.kind === "audio") {
    parts.push(f.abr ? `${Math.round(f.abr)} kbps` : "audio");
  } else {
    parts.push(f.height ? `${f.height}p${f.fps && f.fps > 30 ? f.fps : ""}` : f.note || "video");
  }
  parts.push(f.ext);
  const codec = (f.kind === "audio" ? f.acodec : f.vcodec)?.split(".")[0];
  if (codec) parts.push(codec);
  if (f.kind === "video") parts.push("video only");
  if (f.filesize) parts.push(formatBytes(f.filesize, 0));
  return parts.join(" · ");
}

export function DownloadPanel({
  info,
  batchCount,
  choice,
  onChoiceChange,
  onDownload,
  submitting,
}: {
  info: MediaInfo | null;
  batchCount: number;
  choice: DownloadChoice;
  onChoiceChange: (c: DownloadChoice) => void;
  onDownload: (preset: Preset, formatId?: string) => void;
  submitting: boolean;
}) {
  const [formatId, setFormatId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const video = info?.kind === "video" ? info : null;
  const playlist = info?.kind === "playlist" ? info : null;
  const { mode, options: o } = choice;
  const preset = mode === "video" ? choice.videoPreset : choice.audioPreset;
  const setOpt = (patch: Partial<DownloadOptions>) => onChoiceChange({ ...choice, options: { ...o, ...patch } });

  const qualityOptions = useMemo(() => {
    if (!video?.heights.length) return VIDEO_PRESETS.map((p) => ({ preset: p as Preset, height: null as number | null }));
    const seen = new Set<number>();
    const out: { preset: Preset; height: number | null }[] = [{ preset: "best", height: video.heights[0] }];
    for (const p of VIDEO_PRESETS.slice(1)) {
      const h = pickHeight(video.heights, p);
      if (h == null || seen.has(h) || h === video.heights[0]) {
        if (h != null) seen.add(h);
        continue;
      }
      seen.add(h);
      out.push({ preset: p, height: h });
    }
    return out;
  }, [video]);

  const effectivePreset: Preset = qualityOptions.some((q) => q.preset === choice.videoPreset)
    ? choice.videoPreset
    : "best";
  const activePreset = mode === "video" ? effectivePreset : preset;
  const size = video ? estimateSize(video, mode, activePreset, formatId) : null;

  const formatsSorted = useMemo(() => {
    if (!video) return { av: [], video: [], audio: [] };
    const byQuality = (a: FormatInfo, b: FormatInfo) => (b.height ?? 0) - (a.height ?? 0) || (b.tbr ?? 0) - (a.tbr ?? 0);
    return {
      av: video.formats.filter((f) => f.kind === "av").sort(byQuality),
      video: video.formats.filter((f) => f.kind === "video").sort(byQuality),
      audio: video.formats.filter((f) => f.kind === "audio").sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0)),
    };
  }, [video]);

  const heightLabel = (q: { preset: Preset; height: number | null }) =>
    q.preset === "best"
      ? q.height
        ? `Best available (${q.height}p)`
        : "Best available"
      : q.height && String(q.height) !== q.preset
        ? `${q.height}p`
        : PRESET_LABELS[q.preset];

  const buttonLabel = (() => {
    const target = batchCount > 1 ? `${batchCount} links` : playlist && o.playlist ? `${playlist.count} videos` : null;
    const what = formatId
      ? `format ${formatId}`
      : mode === "audio"
        ? PRESET_LABELS[activePreset]
        : effectivePreset === "best"
          ? "best quality"
          : heightLabel(qualityOptions.find((q) => q.preset === effectivePreset)!);
    return target ? `Download ${target} · ${what}` : `Download ${what}`;
  })();

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
        <div className="space-y-2">
          <Label className="text-xs tracking-wide text-muted-foreground uppercase">Type</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={mode}
            onValueChange={(v) => {
              if (!v) return;
              setFormatId("");
              onChoiceChange({ ...choice, mode: v as "video" | "audio" });
            }}
            className="w-full sm:w-auto"
          >
            <ToggleGroupItem value="video" className="flex-1 px-4 sm:flex-none" aria-label="Video">
              <Video /> Video
            </ToggleGroupItem>
            <ToggleGroupItem value="audio" className="flex-1 px-4 sm:flex-none" aria-label="Audio only">
              <Music /> Audio only
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quality" className="text-xs tracking-wide text-muted-foreground uppercase">
            {mode === "video" ? "Quality" : "Format"}
          </Label>
          {mode === "video" ? (
            <Select
              value={formatId ? "__custom" : effectivePreset}
              onValueChange={(v) => {
                if (v === "__custom") return;
                setFormatId("");
                onChoiceChange({ ...choice, videoPreset: v as Preset });
              }}
            >
              <SelectTrigger id="quality" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {qualityOptions.map((q) => (
                  <SelectItem key={q.preset} value={q.preset}>
                    <span>{heightLabel(q)}</span>
                    {QUALITY_NOTE[q.preset] && q.preset !== "best" && (
                      <span className="text-muted-foreground">{QUALITY_NOTE[q.preset]}</span>
                    )}
                  </SelectItem>
                ))}
                {formatId && <SelectItem value="__custom">Custom format {formatId}</SelectItem>}
              </SelectContent>
            </Select>
          ) : (
            <Select
              value={formatId ? "__custom" : choice.audioPreset}
              onValueChange={(v) => {
                if (v === "__custom") return;
                setFormatId("");
                onChoiceChange({ ...choice, audioPreset: v as Preset });
              }}
            >
              <SelectTrigger id="quality" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIO_PRESETS.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span>{PRESET_LABELS[p]}</span>
                    <span className="text-muted-foreground">{AUDIO_NOTE[p]}</span>
                  </SelectItem>
                ))}
                {formatId && <SelectItem value="__custom">Custom format {formatId}</SelectItem>}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {playlist && (
        <OptionRow
          id="playlist"
          label="Download the whole playlist"
          description={
            o.playlist
              ? `All ${playlist.count} videos go into one download.`
              : "Only the video in the link will be downloaded."
          }
          checked={o.playlist}
          onChange={(v) => setOpt({ playlist: v })}
        />
      )}

      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <OptionRow
          id="meta"
          label="Embed metadata"
          description="Title, artist, chapters"
          checked={o.embedMetadata}
          onChange={(v) => setOpt({ embedMetadata: v })}
        />
        <OptionRow
          id="thumb"
          label="Embed thumbnail"
          description="Cover art in the file"
          checked={o.embedThumbnail}
          onChange={(v) => setOpt({ embedThumbnail: v })}
        />
        <OptionRow
          id="subs"
          label="Subtitles"
          description={mode === "audio" ? "Not available for audio" : "Embed captions if available"}
          checked={o.embedSubs && mode === "video"}
          disabled={mode === "audio"}
          onChange={(v) => setOpt({ embedSubs: v })}
        />
        <OptionRow
          id="sponsor"
          label="Skip sponsor segments"
          description="YouTube only, via SponsorBlock"
          checked={o.sponsorBlock}
          onChange={(v) => setOpt({ sponsorBlock: v })}
        />
      </div>

      {o.embedSubs && mode === "video" && (
        <div className="space-y-1.5">
          <Label htmlFor="sublangs" className="text-xs text-muted-foreground">
            Subtitle languages
          </Label>
          <Input
            id="sublangs"
            value={o.subLangs}
            onChange={(e) => setOpt({ subLangs: e.target.value })}
            placeholder="en.*,es"
            className="font-mono"
          />
          {video && video.subtitleLangs.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Available: {video.subtitleLangs.slice(0, 12).join(", ")}
              {video.subtitleLangs.length > 12 && ` +${video.subtitleLangs.length - 12} more`}
            </p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-dashed">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={showAdvanced}
        >
          <span className="inline-flex items-center gap-2">
            <Scissors className="size-4" /> Clip &amp; advanced
            {(o.clipStart || o.clipEnd || formatId) && <span className="size-1.5 rounded-full bg-primary" />}
          </span>
          <ChevronDown className={cn("size-4 transition-transform", showAdvanced && "rotate-180")} />
        </button>
        {showAdvanced && (
          <div className="space-y-4 border-t border-dashed p-3">
            {!playlist && batchCount <= 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Download only part of the video</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={o.clipStart}
                    onChange={(e) => setOpt({ clipStart: e.target.value })}
                    placeholder="Start 0:00"
                    aria-label="Clip start"
                    className="font-mono"
                  />
                  <span className="text-muted-foreground">→</span>
                  <Input
                    value={o.clipEnd}
                    onChange={(e) => setOpt({ clipEnd: e.target.value })}
                    placeholder="End"
                    aria-label="Clip end"
                    className="font-mono"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Use seconds or mm:ss, like 1:30 → 2:45.</p>
              </div>
            )}
            {video && video.formats.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Exact format</Label>
                <Select value={formatId || "__auto"} onValueChange={(v) => setFormatId(v === "__auto" ? "" : v)}>
                  <SelectTrigger className="w-full font-mono text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value="__auto">Automatic (use the choice above)</SelectItem>
                    {(
                      [
                        ["Video + audio", formatsSorted.av],
                        ["Video only (best audio is added)", formatsSorted.video],
                        ["Audio only", formatsSorted.audio],
                      ] as const
                    ).map(
                      ([label, list]) =>
                        list.length > 0 && (
                          <SelectGroup key={label}>
                            <SelectLabel>{label}</SelectLabel>
                            {list.map((f) => (
                              <SelectItem key={f.id} value={f.id} className="font-mono text-xs">
                                {formatLabel(f)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!video && (playlist || batchCount > 1) && (
              <p className="text-xs text-muted-foreground">
                Clipping and exact formats are available when downloading a single video.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {size ? (
            <>
              Estimated size <span className="font-medium text-foreground">~{formatBytes(size)}</span>
            </>
          ) : video?.isLive ? (
            "Live streams record until you cancel."
          ) : (
            "Files are saved to your library."
          )}
        </p>
        <Button
          size="lg"
          className="h-11 rounded-xl px-6 text-base shadow-lg shadow-primary/25"
          disabled={submitting}
          onClick={() => onDownload(formatId ? "custom" : activePreset, formatId || undefined)}
        >
          <Download /> {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

function OptionRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", disabled && "opacity-50")}>
      <Label htmlFor={id} className="flex cursor-pointer flex-col items-start gap-0.5 font-normal">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
