"use client";

import { CheckCircle2, Cookie, Cpu, ExternalLink, Loader2, Trash2, Upload, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { EnginePref, HealthInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SettingsDialog({
  open,
  onOpenChange,
  engine,
  onEngineChange,
  health,
  onHealthChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  engine: EnginePref;
  onEngineChange: (e: EnginePref) => void;
  health: HealthInfo | null;
  onHealthChange: () => void;
}) {
  const [cookieText, setCookieText] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const engines = health?.engines ?? [];
  const byId = Object.fromEntries(engines.map((e) => [e.id, e]));
  const cookies = health?.cookies;

  const save = async (text: string) => {
    setSaving(true);
    try {
      const status = await api.saveCookies(text);
      toast.success(`Saved ${status.entries} cookies`, {
        description: status.domains.slice(0, 4).join(", ") + (status.domains.length > 4 ? "…" : ""),
      });
      setCookieText("");
      onHealthChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.error.message : "Couldn't save cookies");
    } finally {
      setSaving(false);
    }
  };

  const engineChoices: { value: EnginePref; title: string; body: string; available: boolean; version?: string | null }[] = [
    {
      value: "auto",
      title: "Auto",
      body: "Try the grqz fork first, then fall back to upstream yt-dlp if it fails.",
      available: engines.some((e) => e.available),
    },
    {
      value: "fork",
      title: "grqz/yt-dlp fork only",
      body: "The fork you asked for. Older base, so some sites may be broken.",
      available: !!byId.fork?.available,
      version: byId.fork?.version,
    },
    {
      value: "upstream",
      title: "Upstream yt-dlp only",
      body: "The latest official release. Best site coverage.",
      available: !!byId.upstream?.available,
      version: byId.upstream?.version,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Choose the download engine and add cookies for sites that need a login.</DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Cpu className="size-4" /> Engine
          </h3>
          <RadioGroup value={engine} onValueChange={(v) => onEngineChange(v as EnginePref)} className="gap-2">
            {engineChoices.map((c) => (
              <Label
                key={c.value}
                htmlFor={`engine-${c.value}`}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-muted/40",
                  engine === c.value && "border-primary/60 bg-primary/5",
                  !c.available && "cursor-not-allowed opacity-50",
                )}
              >
                <RadioGroupItem value={c.value} id={`engine-${c.value}`} disabled={!c.available} className="mt-0.5" />
                <div className="flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{c.title}</span>
                    {c.value === "auto" && <Badge className="h-4 px-1.5 text-[10px]">Recommended</Badge>}
                    {c.version && (
                      <Badge variant="outline" className="h-4 px-1.5 font-mono text-[10px]">
                        {c.version}
                      </Badge>
                    )}
                    {!c.available && <span className="text-xs text-destructive">Not installed</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{c.body}</p>
                </div>
              </Label>
            ))}
          </RadioGroup>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Cookie className="size-4" /> Cookies
            </h3>
            {cookies?.present ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="size-3 text-success" /> {cookies.entries} loaded
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                None
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Needed for private or age-restricted videos, and to get past YouTube&apos;s bot check on cloud servers.
            Export a <code className="font-mono">cookies.txt</code> (Netscape format) from a browser where you&apos;re
            logged in.{" "}
            <a
              href="https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-foreground underline-offset-2 hover:underline"
            >
              How to export <ExternalLink className="size-3" />
            </a>
          </p>
          {cookies?.present && (
            <div className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 p-3 text-xs">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">
                  {cookies.domains.length} {cookies.domains.length === 1 ? "site" : "sites"}
                  {cookies.updatedAt && (
                    <span className="font-normal text-muted-foreground"> · updated {formatRelative(cookies.updatedAt)}</span>
                  )}
                </p>
                <p className="line-clamp-2 break-all text-muted-foreground">{cookies.domains.join(", ")}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  await api.deleteCookies();
                  toast("Cookies removed");
                  onHealthChange();
                }}
              >
                <Trash2 /> Remove
              </Button>
            </div>
          )}
          <Textarea
            value={cookieText}
            onChange={(e) => setCookieText(e.target.value)}
            placeholder={"# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1790000000\tSID\t…"}
            className="h-24 font-mono text-[11px]"
            aria-label="Paste cookies.txt contents"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!cookieText.trim() || saving} onClick={() => save(cookieText)}>
              {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Save pasted cookies
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={saving}>
              <Upload /> Upload cookies.txt
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) await save(await file.text());
              }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Stored only on this server in <code className="font-mono">data/cookies.txt</code>. Using an account from a
            datacenter IP can get it flagged, so a secondary account is safer.
          </p>
        </section>

        <Separator />

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">System</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            <ToolRow label="ffmpeg" value={health?.ffmpeg} need="Merging, audio conversion, clipping" />
            <ToolRow label="Deno" value={health?.deno} need="YouTube challenge solving (upstream)" />
            {engines.map((e) => (
              <ToolRow key={e.id} label={e.id === "fork" ? "Fork" : "Upstream"} value={e.version} need={e.path} />
            ))}
            <dt className="text-muted-foreground">Save folder</dt>
            <dd className="truncate font-mono" title={health?.downloadDir}>
              {health?.downloadDir ?? "—"}
            </dd>
            <dt className="text-muted-foreground">Parallel</dt>
            <dd>{health?.maxConcurrent ?? "—"} downloads at once</dd>
          </dl>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function ToolRow({ label, value, need }: { label: string; value: string | null | undefined; need: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5">
        {value ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-success" />
        ) : (
          <XCircle className="size-3.5 shrink-0 text-destructive" />
        )}
        <span className="font-mono">{value ?? "missing"}</span>
        <span className="truncate text-muted-foreground" title={need}>
          · {need}
        </span>
      </dd>
    </>
  );
}
