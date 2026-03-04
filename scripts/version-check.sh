#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ACTUAL_VERSION="$(node -p "require('./package.json').version")"
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

if [[ ! "$ACTUAL_VERSION" =~ ^([0-9]{4})\.([1-9][0-9]*)\.([1-9][0-9]*)(-([1-9][0-9]*))?$ ]]; then
  echo "Version format invalid: ${ACTUAL_VERSION}"
  echo "Expected format: YYYY.M.D or YYYY.M.D-N (SemVer-compatible numeric components, no zero padding)"
  exit 1
fi

if [[ "$ACTUAL_VERSION" =~ -([0-9]+)$ ]]; then
  ordinal="${BASH_REMATCH[1]}"
  if (( ordinal < 2 )); then
    echo "Version suffix invalid: ${ACTUAL_VERSION}"
    echo "Release suffix must be >= 2; omit suffix for the first release of a day."
    exit 1
  fi
  if [[ "$ordinal" =~ ^0[0-9]+$ ]]; then
    echo "Version suffix invalid: ${ACTUAL_VERSION}"
    echo "Release suffix must not contain leading zeroes."
    exit 1
  fi
fi

month_part="$(printf '%s' "$ACTUAL_VERSION" | cut -d. -f2)"
day_part="$(printf '%s' "$ACTUAL_VERSION" | cut -d. -f3 | cut -d- -f1)"
if (( month_part < 1 || month_part > 12 || day_part < 1 || day_part > 31 )); then
  echo "Version date segment invalid: ${ACTUAL_VERSION}"
  echo "Month must be 1-12 and day must be 1-31."
  exit 1
fi

if [[ "$ACTUAL_VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "Version mismatch: ${ACTUAL_VERSION}"
  echo "Expected next release version for ${EXPECTED_DATE} based on existing tags: ${EXPECTED_VERSION}"
  exit 1
fi

echo "Version check passed: ${ACTUAL_VERSION}"
