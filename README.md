# yt-dlp (grqz fork) download environment

A one-command setup for downloading videos with the
[grqz/yt-dlp](https://github.com/grqz/yt-dlp) fork, plus everything it needs:

| Component | Why |
| --- | --- |
| `grqz/yt-dlp@master` in `.venv` | The downloader itself (`yt-dlp 2024.11.18` base) |
| `pycryptodomex`, `brotli`, `certifi`, `mutagen`, `requests`, `urllib3`, `websockets` | yt-dlp's `default` extras: decryption, compression, TLS, metadata embedding, live streams |
| `curl_cffi` | Browser TLS impersonation (`--impersonate`) for sites with bot protection |
| `ffmpeg` / `ffprobe` | Merging separate video and audio streams, HLS/DASH, `-x` audio extraction, remuxing |
| `deno` | JavaScript runtime that newer yt-dlp versions use to solve YouTube challenges |
| upstream `yt-dlp` in `.venv-upstream` (optional) | Current yt-dlp release, for sites the older fork no longer supports |

## Setup

Tested on Ubuntu 24.04. The script uses `apt` for any missing system packages.

```bash
./setup.sh                  # fork only
./setup.sh --with-upstream  # fork plus current upstream yt-dlp
FORK_REF=gdrive ./setup.sh  # install a different branch of the fork
```

## Usage

```bash
./yt-dlp -P downloads "https://example.com/video"
./yt-dlp -f "bv*[height<=720]+ba/b" --merge-output-format mp4 -P downloads URL
./yt-dlp -x --audio-format mp3 -P downloads URL
./yt-dlp --impersonate chrome URL
./yt-dlp --cookies cookies.txt URL   # for sites that require login
./yt-dlp-upstream URL                # current upstream release
```

## Known limitations

- The fork's `master` is based on yt-dlp **2024.11.18**. Extractors for sites
  that changed since then (for example Vimeo and archive.org) fail with an
  extractor error. Use `./yt-dlp-upstream` for those.
- YouTube blocks most datacenter/cloud IPs ("Sign in to confirm you're not a
  bot"). This happens with upstream too. Run from a residential connection, or
  pass cookies exported from a logged-in browser with `--cookies cookies.txt`.
