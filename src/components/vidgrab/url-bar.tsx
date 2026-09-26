"use client";

import { ClipboardPaste, Link2, Loader2, Search, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { extractUrls } from "@/lib/format";

export function UrlBar({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  loading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = extractUrls(value);
  const batch = urls.length > 1;

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        onChange(text.trim());
        onSubmit(text.trim());
      }
    } catch {
      inputRef.current?.focus();
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
      className="group relative flex items-center gap-2 rounded-2xl border bg-card p-2 shadow-lg shadow-black/5 transition focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/15"
    >
      <Link2 className="ml-2 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text").trim();
          if (text && !value.trim() && extractUrls(text).length) {
            e.preventDefault();
            onChange(text);
            onSubmit(text);
          }
        }}
        placeholder="Paste a video, playlist or channel link…"
        aria-label="Video link"
        spellCheck={false}
        autoComplete="off"
        className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/70"
      />
      {value && !loading && (
        <Button type="button" variant="ghost" size="icon" onClick={() => onChange("")} aria-label="Clear">
          <X />
        </Button>
      )}
      {!value && (
        <Button
          type="button"
          variant="ghost"
          onClick={pasteFromClipboard}
          className="hidden sm:inline-flex"
          aria-label="Paste from clipboard"
        >
          <ClipboardPaste /> Paste
        </Button>
      )}
      <Button type="submit" size="lg" disabled={!value.trim() || loading} className="h-11 rounded-xl px-5">
        {loading ? <Loader2 className="animate-spin" /> : <Search />}
        <span className="hidden sm:inline">{batch ? `Add ${urls.length} links` : "Fetch"}</span>
      </Button>
    </form>
  );
}
