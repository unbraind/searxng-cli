#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# `bun run` prepends a temporary Node compatibility shim to PATH. Vitest's V8
# coverage provider needs the real Node runtime, so remove that shim before
# launching Vitest while preserving the caller's configured Node installation.
if [[ "${PATH%%:*}" == /tmp/bun-node-* ]]; then
  export PATH="${PATH#*:}"
fi

node ./node_modules/vitest/vitest.mjs run tests/unit --coverage
