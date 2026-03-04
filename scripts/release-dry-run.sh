#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

bun run version:check
bun run version:audit
bun run lint
bun run secrets:history
bun run clean
bun run build
bun run test:unit
bun run smoke:package
npm pack --dry-run >/dev/null

echo "release dry-run passed"
