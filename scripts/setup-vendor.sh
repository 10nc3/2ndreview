#!/usr/bin/env bash
# setup-vendor.sh — Clone openclaw upstream at a pinned SHA, apply Avijja
# patches, build the Control UI, and (optionally) deploy.
#
# Usage:
#   ./scripts/setup-vendor.sh              # build only
#   ./scripts/setup-vendor.sh --deploy     # build + deploy to global openclaw install
#   UPSTREAM_SHA=abc1234 ./scripts/setup-vendor.sh
#   STRICT_DRIFT=1 ./scripts/setup-vendor.sh   # fail if any patched upstream file changed
#
# Review fixes tagged "FIX2 #N" — grep to trace:
#   grep -n 'FIX2 #' scripts/setup-vendor.sh

set -euo pipefail

# FIX2 #8: pin upstream to a SHA. Without this, every spore bootstrap pulls
# whatever happens to be on openclaw/main, including breakage from 3am pushes.
# Spore promise = "any hardware, any time" — that requires a known-good base.
UPSTREAM_SHA="${UPSTREAM_SHA:-PIN_ME_TO_A_KNOWN_GOOD_SHA}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/openclaw/openclaw.git}"
VENDOR_DIR="${VENDOR_DIR:-vendor/openclaw}"
PATCH_SOURCE="${PATCH_SOURCE:-patches/openclaw-ui}"
DRIFT_MANIFEST="${PATCH_SOURCE}/.upstream-baseline.sha256"
STRICT_DRIFT="${STRICT_DRIFT:-0}"
DEPLOY=0

for arg in "$@"; do
  case "$arg" in
    --deploy) DEPLOY=1 ;;
    -h|--help) sed -n '1,15p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 64 ;;
  esac
done

say() { printf '[setup-vendor] %s\n' "$*"; }

if [[ "$UPSTREAM_SHA" == "PIN_ME_TO_A_KNOWN_GOOD_SHA" ]]; then
  echo "ERROR: UPSTREAM_SHA is not pinned. Set it to a known-good openclaw commit." >&2
  echo "       Example: UPSTREAM_SHA=abcd1234 $0" >&2
  exit 2
fi

# 1. Fetch upstream at the pinned SHA.
# FIX2 #9: don't `git pull --depth 1` on an existing shallow clone — fragile,
# frequently a no-op past the initial depth. Use `git fetch <SHA> + reset --hard`
# which works whether or not the repo already exists.
if [[ -d "$VENDOR_DIR/.git" ]]; then
  say "[1/5] vendor dir exists; fetching upstream @ ${UPSTREAM_SHA}"
  git -C "$VENDOR_DIR" fetch --depth 1 origin "$UPSTREAM_SHA"
  git -C "$VENDOR_DIR" reset --hard FETCH_HEAD
else
  say "[1/5] cloning ${UPSTREAM_URL} @ ${UPSTREAM_SHA}"
  git init --quiet "$VENDOR_DIR"
  git -C "$VENDOR_DIR" remote add origin "$UPSTREAM_URL"
  git -C "$VENDOR_DIR" fetch --depth 1 origin "$UPSTREAM_SHA"
  git -C "$VENDOR_DIR" reset --hard FETCH_HEAD
fi

# 2. Drift check: hash every upstream file the overlay will overwrite and
# compare to the baseline recorded when patches were captured. If any
# upstream file drifted, the overlay is masking new upstream code — warn,
# or fail under STRICT_DRIFT=1.
# FIX2 #13: catches the biggest hazard of the rsync-overlay model
# (silent staleness when upstream evolves under your feet).
if [[ -d "$PATCH_SOURCE" ]]; then
  say "[2/5] checking upstream drift against ${DRIFT_MANIFEST}"
  drift=0
  while IFS= read -r -d '' patch_file; do
    rel="${patch_file#${PATCH_SOURCE}/}"
    upstream_file="${VENDOR_DIR}/ui/src/${rel}"
    if [[ ! -f "$upstream_file" ]]; then
      say "  NEW: ${rel} (no such upstream file — overlay adds it)"
      continue
    fi
    if [[ -f "$DRIFT_MANIFEST" ]]; then
      expected=$(awk -v p=" ${rel}\$" '$0 ~ p {print $1}' "$DRIFT_MANIFEST" || true)
      actual=$(shasum -a 256 "$upstream_file" | awk '{print $1}')
      if [[ -n "$expected" && "$expected" != "$actual" ]]; then
        say "  DRIFT: ${rel}"
        drift=$((drift + 1))
      fi
    fi
  done < <(find "$PATCH_SOURCE" -type f ! -name '.upstream-baseline.sha256' -print0)
  if (( drift > 0 )); then
    if [[ "$STRICT_DRIFT" == "1" ]]; then
      echo "ERROR: ${drift} drifted file(s); refusing to overlay (STRICT_DRIFT=1)" >&2
      exit 3
    fi
    say "  WARN: ${drift} drifted file(s) — overlay will overwrite new upstream code"
    say "        regenerate patches against ${UPSTREAM_SHA} or set STRICT_DRIFT=1 to enforce"
  fi
fi

# 3. Back up pristine upstream src so a user can recover after overlay.
# FIX2 #12: cheap insurance against #13 firing in production.
backup_dir="${VENDOR_DIR}/ui/.src.upstream-${UPSTREAM_SHA:0:7}"
if [[ -d "${VENDOR_DIR}/ui/src" && ! -d "$backup_dir" ]]; then
  say "[3/5] backing up pristine upstream src -> $(basename "$backup_dir")"
  cp -R "${VENDOR_DIR}/ui/src" "$backup_dir"
fi

# 4. Apply overlay.
say "[4/5] applying ${PATCH_SOURCE}/ over ${VENDOR_DIR}/ui/src/"
rsync -a "${PATCH_SOURCE}/" "${VENDOR_DIR}/ui/src/"

# 5. Build.
say "[5/5] building Control UI"
pushd "$VENDOR_DIR/ui" >/dev/null
# FIX2 #10: prefer `npm ci` only when a lockfile exists; otherwise fall back
# to `npm install`. Several openclaw sub-packages do not ship package-lock.json
# and `npm ci` fails hard against them.
if [[ -f package-lock.json ]]; then
  npm ci 2>&1 | tail -10
else
  say "  no package-lock.json; using npm install"
  npm install 2>&1 | tail -10
fi
npm run build 2>&1 | tail -10
popd >/dev/null
say "build done: ${VENDOR_DIR}/dist/control-ui/"

# 6. Optional deploy.
# FIX2 #11: detect openclaw install location instead of hardcoding the macOS
# Homebrew path (/opt/homebrew/lib/node_modules/openclaw/...). Spore promise
# is "any hardware that can run LLM" — Mac-only deploy breaks Linux, Replit,
# Docker, and any non-brew Mac install. Respect OPENCLAW_ROOT override.
if (( DEPLOY == 1 )); then
  say "[deploy] resolving global openclaw install location"
  openclaw_root="${OPENCLAW_ROOT:-}"
  if [[ -z "$openclaw_root" ]]; then
    npm_root=$(npm root -g 2>/dev/null || true)
    if [[ -n "$npm_root" && -d "${npm_root}/openclaw" ]]; then
      openclaw_root="${npm_root}/openclaw"
    fi
  fi
  if [[ -z "$openclaw_root" || ! -d "$openclaw_root" ]]; then
    echo "ERROR: could not locate global openclaw install." >&2
    echo "       Set OPENCLAW_ROOT to its absolute path and re-run." >&2
    exit 4
  fi
  dest="${openclaw_root}/dist/control-ui"
  say "[deploy] copying build -> ${dest}"
  rm -rf "${dest:?}"/*
  cp -R "${VENDOR_DIR}/dist/control-ui/." "$dest"
  if command -v openclaw >/dev/null 2>&1; then
    say "[deploy] restarting openclaw gateway"
    openclaw gateway restart
  fi
fi

say "done"
