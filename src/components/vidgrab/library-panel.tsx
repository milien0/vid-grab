"use client";

import { Download, FolderOpen, Music, Play, Search, Trash2, Video } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fileUrl } from "@/lib/api";
import { formatBytes, formatRelative, hostOf } from "@/lib/format";
import type { LibraryItem } from "@/lib/types";
import { Thumb } from "./shared";

type Filter = "all" | "video" | "audio";

export function LibraryPanel({
  items,
  loading,
  onDelete,
}: {
  items: LibraryItem[] | null;
  loading: boolean;
  onDelete: (item: LibraryItem) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [playing, setPlaying] = useState<LibraryItem | null>(null);
  const [confirm, setConfirm] = useState<LibraryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter(
      (i) =>
        (filter === "all" || i.kind === filter) &&
        (!q || i.title.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)),
    );
  }, [items, query, filter]);

  const total = (items ?? []).reduce((s, i) => s + i.size, 0);

  if (loading && !items) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((k) => (
          <div key={k} className="flex gap-3">
            <Skeleton className="aspect-video w-20" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!items?.length) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <div className="rounded-full bg-muted p-4">
          <FolderOpen className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">Your library is empty</p>
          <p className="text-sm text-muted-foreground">Finished downloads show up here, ready to play or save.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search library"
            className="pl-8"
            aria-label="Search library"
          />
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
        >
          <ToggleGroupItem value="all" className="px-2.5 text-xs">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="video" aria-label="Videos only">
            <Video />
          </ToggleGroupItem>
          <ToggleGroupItem value="audio" aria-label="Audio only">
            <Music />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <ul className="space-y-1">
        {filtered.map((item) => (
          <li key={item.id} className="group flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-muted/50">
            <button
              type="button"
              onClick={() => setPlaying(item)}
              className="relative shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Play ${item.title}`}
            >
              <Thumb src={item.thumbnail} kind={item.kind} className="aspect-video w-20">
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <Play className="size-5 fill-white text-white" />
                </span>
              </Thumb>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={item.name}>
                {item.title}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] uppercase">
                  {item.ext}
                </Badge>
                <span>{formatBytes(item.size)}</span>
                <span className="hidden sm:inline">· {formatRelative(item.createdAt)}</span>
                {hostOf(item.url) && <span className="hidden truncate xl:inline">· {hostOf(item.url)}</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center">
              <Button variant="ghost" size="icon-sm" asChild aria-label="Save to device">
                <a href={fileUrl(item)} download>
                  <Download />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirm(item)}
                aria-label="Delete"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
        {!filtered.length && <li className="py-8 text-center text-sm text-muted-foreground">No matches.</li>}
      </ul>

      <p className="text-right text-xs text-muted-foreground">
        {items.length} {items.length === 1 ? "file" : "files"} · {formatBytes(total)}
      </p>

      <Dialog open={!!playing} onOpenChange={(o) => !o && setPlaying(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="line-clamp-2 pr-6">{playing?.title}</DialogTitle>
            <DialogDescription>
              {playing && `${playing.ext.toUpperCase()} · ${formatBytes(playing.size)}`}
            </DialogDescription>
          </DialogHeader>
          {playing &&
            (playing.kind === "audio" ? (
              <div className="space-y-4">
                <Thumb src={playing.thumbnail} kind="audio" className="mx-auto aspect-square w-48" />
                <audio src={fileUrl(playing, true)} controls autoPlay className="w-full" />
              </div>
            ) : (
              <video
                src={fileUrl(playing, true)}
                controls
                autoPlay
                playsInline
                className="aspect-video w-full rounded-lg bg-black"
              />
            ))}
          <DialogFooter>
            {playing && (
              <Button asChild>
                <a href={fileUrl(playing)} download>
                  <Download /> Save to device
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this file?</DialogTitle>
            <DialogDescription className="break-all">{confirm?.name}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep it</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                if (!confirm) return;
                setDeleting(true);
                await onDelete(confirm).finally(() => setDeleting(false));
                setConfirm(null);
              }}
            >
              <Trash2 /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
