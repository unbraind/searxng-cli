#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TMP_HISTORY="$(mktemp)"
SECRET_FINDINGS="$TMP_HISTORY.secret-findings"
ASSIGNMENT_FINDINGS="$TMP_HISTORY.assignment-findings"
ENDPOINT_FINDINGS="$TMP_HISTORY.endpoint-findings"
FILTERED_ENDPOINT_FINDINGS="$TMP_HISTORY.filtered-endpoint-findings"
trap 'rm -f "$TMP_HISTORY" "$SECRET_FINDINGS" "$ASSIGNMENT_FINDINGS" "$ENDPOINT_FINDINGS" "$FILTERED_ENDPOINT_FINDINGS"' EXIT

git log --all -p --no-color > "$TMP_HISTORY"

if command -v rg >/dev/null 2>&1; then
  SEARCH_CMD=(rg -n --pcre2)
else
  SEARCH_CMD=(grep -nP)
fi

if "${SEARCH_CMD[@]}" '(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH|DSA|PRIVATE) KEY-----|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})' "$TMP_HISTORY" >"$SECRET_FINDINGS"; then
  echo 'Secret-like tokens found in git history:'
  cat "$SECRET_FINDINGS"
  exit 1
fi

if "${SEARCH_CMD[@]}" '(?i)(password|secret|api[_-]?key|token)\s*[:=]\s*["\x27][^"\x27\n]{8,}["\x27]' "$TMP_HISTORY" >"$ASSIGNMENT_FINDINGS"; then
  echo 'Potential hardcoded credential assignments found in git history:'
  cat "$ASSIGNMENT_FINDINGS"
  exit 1
fi

"${SEARCH_CMD[@]}" 'https?://(192\.168\.[0-9]{1,3}\.[0-9]{1,3}|10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.[0-9]{1,3}\.[0-9]{1,3})(:[0-9]{1,5})?' "$TMP_HISTORY" >"$ENDPOINT_FINDINGS" || true
grep -Ev 'https?://(192\.168\.1\.1(:[0-9]{1,5})?|192\.168\.1\.183:38522|192\.168\.1\.10|10\.0\.0\.1|172\.16\.0\.1|172\.31\.255\.255)([/#?.,;:)}[:space:]"'"'"'`]|$)' "$ENDPOINT_FINDINGS" >"$FILTERED_ENDPOINT_FINDINGS" || true
if [ -s "$FILTERED_ENDPOINT_FINDINGS" ]; then
  echo 'Private network endpoint found in git history:'
  cat "$FILTERED_ENDPOINT_FINDINGS"
  exit 1
fi

echo 'history secret scan passed'
