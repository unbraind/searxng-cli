#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
LIVE_SEARXNG_URL="${SEARXNG_URL:-http://192.168.1.183:38522}"
unset SEARXNG_URL
INSTALL_DIR="$(mktemp -d)"
ARTIFACT_DIR="$INSTALL_DIR/artifacts"
export ARTIFACT_DIR
mkdir -p "$ARTIFACT_DIR"
trap 'rm -rf "$INSTALL_DIR"' EXIT

bash scripts/version-check.sh
bun run clean
bun run build
bun run typecheck
echo "Running the complete unit and coverage suite..."
bun run test:coverage

npm install --global --prefix "$INSTALL_DIR" "$ROOT_DIR" --ignore-scripts --no-audit --no-fund >/dev/null
export PATH="$INSTALL_DIR/bin:$PATH"
hash -r
[[ "$(command -v searxng)" == "$INSTALL_DIR/bin/searxng" ]]

searxng --set-url "$LIVE_SEARXNG_URL"
searxng --set-format toon

searxng --health-check
searxng --instance-info-json >"${ARTIFACT_DIR}/searxng-instance-info.json"
searxng instance stats --json >"${ARTIFACT_DIR}/searxng-instance-stats.json"
searxng instance errors --json >"${ARTIFACT_DIR}/searxng-instance-errors.json"
if searxng instance metrics --raw >"${ARTIFACT_DIR}/searxng-instance-metrics.txt" 2>"${ARTIFACT_DIR}/searxng-instance-metrics-error.txt"; then
  METRICS_AVAILABLE=true
else
  METRICS_AVAILABLE=false
fi
searxng autocomplete "release readiness" --json >"${ARTIFACT_DIR}/searxng-autocomplete.json"
searxng --cache-status >"${ARTIFACT_DIR}/searxng-cache-status.txt"
searxng --cache-status-json >"${ARTIFACT_DIR}/searxng-cache-status.json"
searxng --paths-json >"${ARTIFACT_DIR}/searxng-paths.json"
searxng --schema-json json >"${ARTIFACT_DIR}/searxng-schema-json.json"
searxng commands --json >"${ARTIFACT_DIR}/searxng-commands.json"
searxng --test

searxng "release readiness smoke test" --json --limit 2 --validate-output >"${ARTIFACT_DIR}/searxng-release-json-output.json"
cp "${ARTIFACT_DIR}/searxng-release-json-output.json" "${ARTIFACT_DIR}/searxng-payload.json"
searxng --validate-payload-json json "${ARTIFACT_DIR}/searxng-payload.json" >"${ARTIFACT_DIR}/searxng-payload-check.json"
if command -v jq >/dev/null 2>&1; then
  jq -e '.schemaVersion == "1.0" and .format == "json" and (.results | type == "array")' "${ARTIFACT_DIR}/searxng-release-json-output.json" >/dev/null
  jq -e '.format == "payload-validation" and .targetFormat == "json" and .valid == true' "${ARTIFACT_DIR}/searxng-payload-check.json" >/dev/null
else
  node -e 'const data = JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-release-json-output.json","utf8")); if (data.schemaVersion !== "1.0" || data.format !== "json" || !Array.isArray(data.results)) process.exit(1);'
  node -e 'const data = JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-payload-check.json","utf8")); if (data.format !== "payload-validation" || data.targetFormat !== "json" || data.valid !== true) process.exit(1);'
fi

TOON_OUT="$(searxng "release readiness smoke test" --toon --limit 2 --validate-output)"
node -e 'const { decode } = require("@toon-format/toon"); const d = decode(process.argv[1]); if (!d || typeof d.q !== "string" || !Array.isArray(d.results)) process.exit(1);' "$TOON_OUT"

node -e 'const schema = JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-schema-json.json","utf8")); if (schema.format !== "json" || schema.mimeType !== "application/json" || !Array.isArray(schema.requiredChecks)) process.exit(1);'

YAML_OUT="$(searxng "release readiness smoke test" --format yaml --limit 2 --validate-output)"
printf '%s\n' "$YAML_OUT" | rg -q '^schemaVersion:'
printf '%s\n' "$YAML_OUT" | rg -q '^results:'

XML_OUT="$(searxng "release readiness smoke test" --format xml --limit 2 --validate-output)"
printf '%s\n' "$XML_OUT" | rg -q '^<\?xml version="1\.0"'
printf '%s\n' "$XML_OUT" | rg -q '<search '

CSV_OUT="$(searxng "release readiness smoke test" --format csv --limit 2 --validate-output)"
printf '%s\n' "$CSV_OUT" | head -n 1 | rg -q '^i,title,url,engine,score,text$'

RSS_OUT="$(searxng "release readiness smoke test" --post --no-cache --format rss --limit 2 --validate-output)"
printf '%s\n' "$RSS_OUT" | rg -q '<rss version="2\.0">'

node -e 'const data = JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-cache-status.json","utf8")); if (data.format !== "cache-status" || typeof data.entries !== "number") process.exit(1);'
node -e 'const data = JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-paths.json","utf8")); if (data.format !== "paths" || !data.files || typeof data.files.settings !== "string") process.exit(1);'
node -e 'const data = JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-instance-stats.json","utf8")); if (data.format !== "instance-stats" || !Array.isArray(data.data?.capabilities?.engines) || typeof data.data?.errors !== "object") process.exit(1);'
node -e 'const data = JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-instance-errors.json","utf8")); if (data.format !== "instance-errors" || typeof data.data !== "object") process.exit(1);'
node -e 'const data = JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-autocomplete.json","utf8")); if (data.format !== "autocomplete" || !Array.isArray(data.suggestions)) process.exit(1);'
node -e 'const data = JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-commands.json","utf8")); if (data.format !== "cli-contracts" || data.defaults?.output !== "toon" || data.defaults?.searchMethod !== "get") process.exit(1);'
if [ "$METRICS_AVAILABLE" = true ]; then
  rg -q '^(# HELP|# TYPE|[A-Za-z_:][A-Za-z0-9_:]*)' "${ARTIFACT_DIR}/searxng-instance-metrics.txt"
else
  rg -q 'HTTP (401|404) from /metrics' "${ARTIFACT_DIR}/searxng-instance-metrics-error.txt"
fi

echo "release:check passed"
