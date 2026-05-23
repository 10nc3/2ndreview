#!/bin/bash
# nyanbook-runner — Load env, run script, then clear
# Usage: ./lib/nyanbook/runner.sh node ./lib/sync/workspace-sync.js
# (lib/nyan-sync.js + lib/nyanbook-sync.js shims removed — see FIX #13)

# Try to load from env.nyanbook in workspace root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$(dirname "$SCRIPT_DIR")/../.env.nyanbook"

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

# Execute command
"$@"

# Clear tokens from env
unset NYAN_PLAYGROUND_TOKEN NYAN_BOOK1_TOKEN NYAN_BOOK2_TOKEN
