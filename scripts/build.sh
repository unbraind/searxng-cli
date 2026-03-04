#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="${SEARXNG_CLI_VERSION:-$(node -p "require('./package.json').version")}"

esbuild src/searxng-cli.ts src/index.ts \
  --bundle \
  --platform=node \
  --target=node18 \
  --format=cjs \
  --outdir=dist \
  --sourcemap \
  --banner:js='#!/usr/bin/env node' \
  --define:__APP_VERSION__="\"${VERSION}\""

chmod +x dist/searxng-cli.js
