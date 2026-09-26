# vid-grab

A self-hosted video downloader with a web UI, built on the
[grqz/yt-dlp](https://github.com/grqz/yt-dlp) fork with upstream
[yt-dlp](https://github.com/yt-dlp/yt-dlp) as an automatic fallback.

Paste a link, preview the video, pick a quality or audio format, and watch it
download live into a library you can play from and save to your device.

## Features

- **Preview before downloading**: title, channel, duration, views, thumbnail,
  and the qualities the video actually offers.
- **Video up to 4K or audio only**: best video and audio merged into MP4
  (MKV when the codecs need it), or MP3, M4A or the original audio stream.
- **Exact formats**: pick any specific format yt-dlp reports, with estimated
  file sizes.
- **Clip a section**: download only `1:30 → 2:45`.
- **Playlists and batches**: download a whole playlist, or paste several links
  at once to queue them all.
- **Extras**: embedded metadata, chapters, thumbnails and subtitles, plus
  SponsorBlock segment removal for YouTube.
- **Live queue**: progress, speed and time remaining streamed over
  Server-Sent Events, two downloads in parallel, and cancel or retry. Downloads
  keep running if you close the tab.
- **Library**: play in the browser, save to device, search, filter and
  delete.
- **Engine fallback**: *Auto* tries the grqz fork first and retries with
  upstream yt-dlp if it fails. You can also force one engine in Settings.
- **Cookies**: paste or upload a `cookies.txt` for private or age-restricted
  videos, or to get past YouTube's bot check.
- **Friendly errors**: bot checks, logins, geo-blocks and broken extractors
  are explained in plain language, with a fix to try and the full engine log.

## Quick start

Requires Python 3.9+, Node.js 20+, and `apt` (Ubuntu/Debian) or Homebrew
(macOS) to install ffmpeg if it's missing.

```bash
./setup.sh      # fork + upstream yt-dlp, ffmpeg, Deno, npm dependencies
npm run dev     # http://localhost:4317
```

For a production build: `npm run build && npm start`.

`setup.sh` options:

| Option | Effect |
| --- | --- |
| `--fork-only` | Skip upstream yt-dlp (Auto mode then uses only the fork) |
| `--no-web` | Skip `npm install` (CLI only) |
| `FORK_REF=<branch>` | Install a different branch of the fork, e.g. `FORK_REF=gdrive ./setup.sh` |

## Configuration

Set these as environment variables before `npm run dev` or `npm start`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4317` | HTTP port |
| `VIDGRAB_DOWNLOAD_DIR` | `./downloads` | Where files are saved (one folder per download) |
| `VIDGRAB_DATA_DIR` | `./data` | Where `cookies.txt` is stored |
| `VIDGRAB_MAX_CONCURRENT` | `2` | Downloads that run at the same time |
| `VIDGRAB_FORK_BIN` | `./.venv/bin/yt-dlp` | Path to the fork's binary |
| `VIDGRAB_UPSTREAM_BIN` | `./.venv-upstream/bin/yt-dlp` | Path to upstream yt-dlp |

## Command line

The engines also work directly from the terminal:

```bash
./yt-dlp -P downloads URL                                          # grqz fork
./yt-dlp -f "bv*[height<=720]+ba/b" --merge-output-format mp4 -P downloads URL
./yt-dlp -x --audio-format mp3 -P downloads URL
./yt-dlp-upstream --cookies data/cookies.txt URL                   # upstream
```

## How it works

```
src/
  app/api/
    analyze/        POST   fetch video/playlist info (yt-dlp -J), with engine fallback
    jobs/           GET/POST/DELETE   list, create (single or batch), clear finished
    jobs/[id]/      POST {action: cancel|retry}, DELETE to dismiss
    events/         GET    Server-Sent Events stream of job updates
    library/        GET    finished files on disk
    files/[jobId]/[name]   GET (supports Range for seeking) / DELETE
    cookies/        GET/POST/DELETE   manage data/cookies.txt
    health/         GET    engine, ffmpeg and Deno versions
  lib/server/
    ytdlp.ts        argument building, error classification, info parsing
    jobs.ts         in-memory queue, spawns yt-dlp, parses progress output
    library.ts      reads downloads/, guards against path traversal
  components/vidgrab/   UI (shadcn/ui + Tailwind)
```

Each download runs `yt-dlp` as a child process with custom progress templates,
so the server can report structured progress without scraping console output.
Finished files live in `downloads/<job-id>/` next to a small `.vidgrab.json`
metadata file, so the library survives restarts.

## Known limitations

- **YouTube on cloud servers.** YouTube blocks most datacenter IPs ("Sign in to
  confirm you're not a bot"), with both the fork and upstream. Run vid-grab on
  your own computer, or add cookies in Settings (a secondary account is safer).
- **The fork is old.** grqz/yt-dlp `master` is based on yt-dlp 2024.11.18, so
  sites that changed since then fail on it. Auto mode retries those with
  upstream.
- **No login system.** Don't expose vid-grab to the public internet as-is:
  anyone who can reach it can download to your disk.
- **DRM-protected** services (Netflix, Disney+, Spotify, etc.) aren't supported
  by yt-dlp.

Only download content you own or have permission to download.
