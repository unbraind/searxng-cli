#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TMP_HISTORY="$(mktemp)"
trap 'rm -f "$TMP_HISTORY"' EXIT

git log --all -p --no-color > "$TMP_HISTORY"

if command -v rg >/dev/null 2>&1; then
  SEARCH_CMD=(rg -n --pcre2)
else
  SEARCH_CMD=(grep -nP)
fi

if "${SEARCH_CMD[@]}" '(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH|DSA|PRIVATE) KEY-----|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})' "$TMP_HISTORY" >/tmp/searxng-secret-findings.txt; then
  echo 'Secret-like tokens found in git history:'
  cat /tmp/searxng-secret-findings.txt
  exit 1
fi

if "${SEARCH_CMD[@]}" '(?i)(password|secret|api[_-]?key|token)\s*[:=]\s*["\x27][^"\x27\n]{8,}["\x27]' "$TMP_HISTORY" >/tmp/searxng-secret-assignments.txt; then
  echo 'Potential hardcoded credential assignments found in git history:'
  cat /tmp/searxng-secret-assignments.txt
  exit 1
fi

"${SEARCH_CMD[@]}" 'https?://(192\.168\.[0-9]{1,3}\.[0-9]{1,3}|10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.[0-9]{1,3}\.[0-9]{1,3})(:[0-9]{1,5})?' "$TMP_HISTORY" >/tmp/searxng-private-endpoint-findings.txt || true
grep -Ev 'https?://192\.168\.1\.1(:[0-9]{1,5})?' /tmp/searxng-private-endpoint-findings.txt >/tmp/searxng-private-endpoint-findings-filtered.txt || true
if [ -s /tmp/searxng-private-endpoint-findings-filtered.txt ]; then
  echo 'Private network endpoint found in git history:'
  cat /tmp/searxng-private-endpoint-findings-filtered.txt
  exit 1
fi

echo 'history secret scan passed'
