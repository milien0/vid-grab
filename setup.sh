#!/usr/bin/env bash
# Installs everything vid-grab needs: the grqz/yt-dlp fork, upstream yt-dlp,
# ffmpeg, Deno and the web app's npm dependencies.
# Usage: ./setup.sh [--fork-only] [--no-web]
set -euo pipefail

cd "$(dirname "$0")"

FORK_REF="${FORK_REF:-master}"
WITH_UPSTREAM=1
WITH_WEB=1
for arg in "$@"; do
  case "$arg" in
    --fork-only) WITH_UPSTREAM=0 ;;
    --with-upstream) WITH_UPSTREAM=1 ;;
    --no-web) WITH_WEB=0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

need=()
command -v ffmpeg >/dev/null || need+=(ffmpeg)
command -v curl >/dev/null || need+=(curl)
command -v unzip >/dev/null || need+=(unzip)
if [[ "$(uname)" == "Darwin" ]]; then
  if ((${#need[@]})); then
    command -v brew >/dev/null || { echo "Install Homebrew first: https://brew.sh" >&2; exit 1; }
    echo ">> Installing with Homebrew: ${need[*]}"
    brew install "${need[@]}"
  fi
else
  python3 -c 'import ensurepip' 2>/dev/null || need+=(python3-venv)
  if ((${#need[@]})); then
    echo ">> Installing system packages: ${need[*]}"
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${need[@]}"
  fi
fi

if ! command -v deno >/dev/null && [ ! -x "$HOME/.deno/bin/deno" ]; then
  echo ">> Installing Deno (JS runtime yt-dlp uses for YouTube challenges)"
  curl -fsSL https://deno.land/install.sh | sh -s -- -y >/dev/null
fi

echo ">> Installing grqz/yt-dlp@${FORK_REF} into .venv"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q --upgrade --force-reinstall --no-deps \
  "yt-dlp @ git+https://github.com/grqz/yt-dlp@${FORK_REF}"
.venv/bin/pip install -q "yt-dlp[default,curl-cffi] @ git+https://github.com/grqz/yt-dlp@${FORK_REF}"

if ((WITH_UPSTREAM)); then
  echo ">> Installing upstream yt-dlp into .venv-upstream"
  [ -d .venv-upstream ] || python3 -m venv .venv-upstream
  .venv-upstream/bin/pip install -q --upgrade pip
  .venv-upstream/bin/pip install -q --upgrade "yt-dlp[default,curl-cffi]"
fi

if ((WITH_WEB)); then
  if command -v npm >/dev/null; then
    echo ">> Installing web app dependencies"
    npm install --silent --no-audit --no-fund
  else
    echo "!! npm not found: install Node.js 20+ to use the web app (the CLI wrappers still work)." >&2
  fi
fi

echo
echo ">> Done."
echo "   fork:     $(.venv/bin/yt-dlp --version)  (./yt-dlp)"
[ -x .venv-upstream/bin/yt-dlp ] && echo "   upstream: $(.venv-upstream/bin/yt-dlp --version)  (./yt-dlp-upstream)"
echo "   ffmpeg:   $(ffmpeg -version | head -1 | cut -d' ' -f3)"
echo "   deno:     $(PATH="$HOME/.deno/bin:$PATH" deno --version | head -1 | cut -d' ' -f2)"
((WITH_WEB)) && command -v npm >/dev/null && echo "   web app:  npm run dev  →  http://localhost:4317"
true
