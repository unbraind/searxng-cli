#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required for smoke:package"
  exit 1
fi

PACKAGE_TGZ="$(npm pack --silent | tail -n 1)"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
  rm -f "$ROOT_DIR/$PACKAGE_TGZ"
}
trap cleanup EXIT

cp "$ROOT_DIR/$PACKAGE_TGZ" "$TMP_DIR/"

cat > "$TMP_DIR/package.json" <<'JSON'
{
  "name": "searxng-cli-smoke",
  "private": true
}
JSON

pushd "$TMP_DIR" >/dev/null
npm install --silent "./$PACKAGE_TGZ"

SEARXNG_CLI_CONFIG_DIR="$TMP_DIR/config" \
SEARXNG_URL="http://localhost:8080" \
npx --yes searxng --version >/dev/null

SEARXNG_CLI_CONFIG_DIR="$TMP_DIR/config" \
SEARXNG_URL="http://localhost:8080" \
bunx --bun searxng --version >/dev/null

SEARXNG_CLI_CONFIG_DIR="$TMP_DIR/config" \
SEARXNG_URL="http://localhost:8080" \
npx --yes searxng-cli --version >/dev/null

SEARXNG_CLI_CONFIG_DIR="$TMP_DIR/config" \
SEARXNG_URL="http://localhost:8080" \
bunx --bun searxng-cli --version >/dev/null
popd >/dev/null

echo "package smoke passed (npx + bunx, searxng + searxng-cli)"
