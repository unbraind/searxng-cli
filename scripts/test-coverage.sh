#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# `bun run` prepends a temporary Node compatibility shim to PATH. Nested Bun
# scripts can add more than one. Vitest's V8 coverage provider needs the real
# Node runtime, so remove every shim while preserving configured Node entries.
node_path=""
IFS=: read -ra path_entries <<< "$PATH"
for path_entry in "${path_entries[@]}"; do
  if [[ "$path_entry" != /tmp/bun-node-* ]]; then
    node_path="${node_path:+$node_path:}$path_entry"
  fi
done
export PATH="$node_path"

node ./node_modules/vitest/vitest.mjs run tests/unit --coverage
