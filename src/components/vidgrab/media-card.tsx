"use client";

import { Clock, Eye, ListVideo, Radio, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount, formatDuration, formatUploadDate, hostOf } from "@/lib/format";
import type { MediaInfo } from "@/lib/types";
import { ENGINE_SHORT, Thumb } from "./shared";

export function MediaCard({ info }: { info: MediaInfo }) {
  const isPlaylist = info.kind === "playlist";
  const duration = !isPlaylist ? formatDuration(info.duration) : null;
  const meta = [
    info.uploader && { icon: User, text: info.uploader },
    !isPlaylist && info.viewCount != null && { icon: Eye, text: `${formatCount(info.viewCount)} views` },
    !isPlaylist && formatUploadDate(info.uploadDate) && { icon: Clock, text: formatUploadDate(info.uploadDate)! },
    isPlaylist && { icon: ListVideo, text: `${info.count} videos` },
  ].filter(Boolean) as { icon: typeof User; text: string }[];

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <Thumb src={info.thumbnail} className="aspect-video w-full sm:w-64">
        {duration && (
          <span className="absolute right-2 bottom-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-xs text-white">
            {duration}
          </span>
        )}
        {!isPlaylist && info.isLive && (
          <span className="absolute top-2 left-2 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
            <Radio className="size-3" /> LIVE
          </span>
        )}
        {isPlaylist && (
          <span className="absolute inset-y-0 right-0 flex w-1/3 flex-col items-center justify-center gap-1 bg-black/70 text-white">
            <ListVideo className="size-6" />
            <span className="text-sm font-semibold">{info.count}</span>
          </span>
        )}
      </Thumb>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{info.extractor}</Badge>
          {isPlaylist && <Badge variant="outline">Playlist</Badge>}
          <Badge variant="outline" className="text-muted-foreground">
            via {ENGINE_SHORT[info.engine]}
          </Badge>
        </div>
        <h2 className="line-clamp-2 text-lg leading-snug font-semibold text-balance">{info.title}</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {meta.map(({ icon: Icon, text }) => (
            <span key={text} className="inline-flex items-center gap-1.5">
              <Icon className="size-3.5" /> {text}
            </span>
          ))}
        </div>
        <a
          href={info.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-xs text-muted-foreground/80 hover:text-foreground hover:underline"
        >
          {hostOf(info.url)} ↗
        </a>
      </div>
    </div>
  );
}

export function MediaCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <Skeleton className="aspect-video w-full sm:w-64" />
      <div className="flex-1 space-y-3 py-1">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-6 w-4/5" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  );
}
