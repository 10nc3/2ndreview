#!/bin/bash
# setup-vendor.sh — Clone openclaw upstream, apply Avijja patches, build UI
# Usage: ./scripts/setup-vendor.sh
# Result: vendor/openclaw/ with modded UI, ready to deploy

set -euo pipefail

VENDOR_DIR="vendor/openclaw"
UPSTREAM_URL="https://github.com/openclaw/openclaw.git"
PATCH_SOURCE="patches/openclaw-ui"

echo "╔══════════════════════════════════════════════╗"
echo "║  Avijja/Nyanbook — Vendor Bootstrap Script  ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# 1. Clone upstream (shallow, main branch)
if [[ -d "$VENDOR_DIR/.git" ]]; then
  echo "[1/4] Upstream already cloned at $VENDOR_DIR — pulling latest..."
  git -C "$VENDOR_DIR" pull --depth 1 origin main
else
  echo "[1/4] Cloning openclaw/openclaw#main into $VENDOR_DIR..."
  git clone --depth 1 "$UPSTREAM_URL" "$VENDOR_DIR"
fi
echo ""

# 2. Apply patches
echo "[2/4] Applying Avijja patches from $PATCH_SOURCE/..."
if [[ ! -d "$PATCH_SOURCE" ]]; then
  echo "ERROR: Patch directory $PATCH_SOURCE not found."
  echo "Run this script from the repo root (where patches/ lives)."
  exit 1
fi

# rsync our patch files into the upstream tree
rsync -av "$PATCH_SOURCE/" "$VENDOR_DIR/ui/src/"
echo ""

# 3. Build UI
echo "[3/4] Building Control UI..."
cd "$VENDOR_DIR/ui"
npm ci 2>&1 | tail -5
echo ""
npm run build 2>&1 | tail -5
echo ""

# 4. Summary
echo "[4/4] Done."
echo ""
echo "  Modded source: $VENDOR_DIR/ui/src/"
echo "  Build output:  $VENDOR_DIR/dist/control-ui/"
echo ""
echo "To deploy to global install:"
echo "  rm -rf /opt/homebrew/lib/node_modules/openclaw/dist/control-ui/*"
echo "  cp -r $VENDOR_DIR/dist/control-ui/* /opt/homebrew/lib/node_modules/openclaw/dist/control-ui/"
echo "  openclaw gateway restart"
echo ""
echo "nyan~ 🔥"
