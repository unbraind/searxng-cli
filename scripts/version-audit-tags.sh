#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TAGS="$(git tag --list)"
if [[ -z "${TAGS}" ]]; then
  echo "No git tags found; release tag audit skipped."
  exit 0
fi

declare -A DAY_ORDINALS=()
errors=0

while IFS= read -r tag; do
  [[ -z "$tag" ]] && continue
  normalized="${tag#v}"

  if [[ "$normalized" =~ ^([0-9]{4})\.([0-9]+)\.([0-9]+)(-([0-9]+))?$ ]]; then
    year="${BASH_REMATCH[1]}"
    month_raw="${BASH_REMATCH[2]}"
    day_raw="${BASH_REMATCH[3]}"
    ordinal_raw="${BASH_REMATCH[5]:-1}"

    if [[ "$month_raw" =~ ^0[0-9]+$ || "$day_raw" =~ ^0[0-9]+$ ]]; then
      echo "Invalid release tag ${tag}: month/day must not be zero-padded."
      errors=1
      continue
    fi
    if [[ "$ordinal_raw" =~ ^0[0-9]+$ ]]; then
      echo "Invalid release tag ${tag}: release suffix must not be zero-padded."
      errors=1
      continue
    fi

    month=$((10#$month_raw))
    day=$((10#$day_raw))
    ordinal=$((10#$ordinal_raw))
    if (( month < 1 || month > 12 || day < 1 || day > 31 )); then
      echo "Invalid release tag ${tag}: month/day out of range."
      errors=1
      continue
    fi
    if [[ "$normalized" == *-* ]] && (( ordinal < 2 )); then
      echo "Invalid release ordinal in tag ${tag}: suffix must start at 2."
      errors=1
      continue
    fi

    day_key="${year}.${month}.${day}"
    key="${day_key}:${ordinal}"
    if [[ -n "${DAY_ORDINALS[$key]:-}" ]]; then
      echo "Duplicate release ordinal for ${day_key}: ${ordinal} (${tag})"
      errors=1
      continue
    fi
    DAY_ORDINALS[$key]=1
    continue
  fi

  if [[ "$normalized" =~ ^[0-9]{4}\. ]]; then
    echo "Malformed release-like tag ${tag}; expected YYYY.M.D or YYYY.M.D-N."
    errors=1
    continue
  fi
done < <(printf '%s\n' "$TAGS")

if (( errors != 0 )); then
  exit 1
fi

days="$(printf '%s\n' "${!DAY_ORDINALS[@]}" | cut -d: -f1 | sort -u || true)"
while IFS= read -r day; do
  [[ -z "$day" ]] && continue
  ordinals="$(printf '%s\n' "${!DAY_ORDINALS[@]}" | rg "^${day}:" | cut -d: -f2 | sort -n)"
  max="$(printf '%s\n' "$ordinals" | tail -n 1)"
  if [[ -z "$max" ]]; then
    continue
  fi
  for n in $(seq 1 "$max"); do
    if ! printf '%s\n' "$ordinals" | rg -q "^${n}$"; then
      echo "Missing release ordinal for ${day}: ${n}"
      errors=1
    fi
  done
done < <(printf '%s\n' "$days")

if (( errors != 0 )); then
  exit 1
fi

echo "Release tag audit passed"
