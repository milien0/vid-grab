#!/usr/bin/env bash
# Installs the grqz/yt-dlp fork plus everything it needs to download videos.
# Usage: ./setup.sh [--with-upstream]
set -euo pipefail

cd "$(dirname "$0")"

FORK_REF="${FORK_REF:-master}"

need_apt=()
command -v ffmpeg >/dev/null || need_apt+=(ffmpeg)
python3 -c 'import ensurepip' 2>/dev/null || need_apt+=(python3-venv)
command -v curl >/dev/null || need_apt+=(curl)
command -v unzip >/dev/null || need_apt+=(unzip)
if ((${#need_apt[@]})); then
  echo ">> Installing system packages: ${need_apt[*]}"
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${need_apt[@]}"
fi

if ! command -v deno >/dev/null && [ ! -x "$HOME/.deno/bin/deno" ]; then
  echo ">> Installing Deno (JS runtime used by yt-dlp for YouTube challenges)"
  curl -fsSL https://deno.land/install.sh | sh -s -- -y >/dev/null
fi

echo ">> Installing grqz/yt-dlp@${FORK_REF} into .venv"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q --upgrade --force-reinstall --no-deps \
  "yt-dlp @ git+https://github.com/grqz/yt-dlp@${FORK_REF}"
.venv/bin/pip install -q "yt-dlp[default,curl-cffi] @ git+https://github.com/grqz/yt-dlp@${FORK_REF}"

if [[ "${1:-}" == "--with-upstream" ]]; then
  echo ">> Installing upstream yt-dlp into .venv-upstream"
  [ -d .venv-upstream ] || python3 -m venv .venv-upstream
  .venv-upstream/bin/pip install -q --upgrade pip
  .venv-upstream/bin/pip install -q --upgrade "yt-dlp[default,curl-cffi]"
fi

echo
echo ">> Done."
echo "   fork:     $(.venv/bin/yt-dlp --version)  (.venv/bin/yt-dlp or ./yt-dlp)"
[ -x .venv-upstream/bin/yt-dlp ] && echo "   upstream: $(.venv-upstream/bin/yt-dlp --version)  (./yt-dlp-upstream)"
echo "   ffmpeg:   $(ffmpeg -version | head -1 | cut -d' ' -f3)"
echo "   deno:     $(PATH="$HOME/.deno/bin:$PATH" deno --version | head -1 | cut -d' ' -f2)"
