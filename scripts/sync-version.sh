#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

UTC_DATE_RAW="$(date -u +%Y-%m-%d)"
IFS='-' read -r UTC_YEAR UTC_MONTH UTC_DAY <<< "$UTC_DATE_RAW"
EXPECTED_DATE="${UTC_YEAR}.$((10#$UTC_MONTH)).$((10#$UTC_DAY))"
MAX_RELEASE_ORDINAL=0

while IFS= read -r tag; do
  [[ -z "$tag" ]] && continue
  if [[ "$tag" == "$EXPECTED_DATE" || "$tag" == "v$EXPECTED_DATE" ]]; then
    if (( MAX_RELEASE_ORDINAL < 1 )); then
      MAX_RELEASE_ORDINAL=1
    fi
    continue
  fi
  if [[ "$tag" =~ ^v?${EXPECTED_DATE}-([0-9]+)$ ]]; then
    ordinal="${BASH_REMATCH[1]}"
    if (( ordinal > MAX_RELEASE_ORDINAL )); then
      MAX_RELEASE_ORDINAL="$ordinal"
    fi
  fi
done < <(git tag --list)

if (( MAX_RELEASE_ORDINAL == 0 )); then
  EXPECTED_VERSION="${EXPECTED_DATE}"
else
  EXPECTED_VERSION="${EXPECTED_DATE}-$((MAX_RELEASE_ORDINAL + 1))"
fi
CURRENT_VERSION="$(node -p "require('./package.json').version")"

if [[ "$CURRENT_VERSION" == "$EXPECTED_VERSION" ]]; then
  echo "Version already synced: ${CURRENT_VERSION}"
  exit 0
fi

node -e '
const fs = require("fs");
const path = require("path");
const file = path.resolve(process.cwd(), "package.json");
const expected = process.argv[1];
if (!expected || typeof expected !== "string") {
  throw new Error("Missing expected version argument");
}
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
pkg.version = expected;
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
' "$EXPECTED_VERSION"

echo "Version synced: ${CURRENT_VERSION} -> ${EXPECTED_VERSION}"
