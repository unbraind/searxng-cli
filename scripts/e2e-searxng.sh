#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SEARXNG_URL="${SEARXNG_URL:-http://192.168.1.183:38522}"
TIMEOUT_BIN="${TIMEOUT_BIN:-timeout}"
CMD_TIMEOUT="${CMD_TIMEOUT:-120s}"
QUERY="${E2E_QUERY:-searxng cli full e2e smoke test}"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"
INSTALL_DIR="$(mktemp -d)"
ARTIFACT_DIR="$INSTALL_DIR/artifacts"
export ARTIFACT_DIR
mkdir -p "$ARTIFACT_DIR"
trap 'rm -rf "$INSTALL_DIR"' EXIT

if ! command -v "$TIMEOUT_BIN" >/dev/null 2>&1; then
  echo "Missing required command: $TIMEOUT_BIN"
  exit 1
fi
if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
  echo "Missing required command: $NODE_BIN"
  exit 1
fi

run() {
  "$TIMEOUT_BIN" "$CMD_TIMEOUT" bash -lc "$1"
}

bun run build >/dev/null
npm install --global --prefix "$INSTALL_DIR" "$ROOT_DIR" --ignore-scripts --no-audit --no-fund >/dev/null
export PATH="$INSTALL_DIR/bin:$PATH"
hash -r
[[ "$(command -v searxng)" == "$INSTALL_DIR/bin/searxng" ]]

run "searxng --setup-local"
run "searxng set url \"$SEARXNG_URL\""
run "searxng set format toon"
run "searxng --health-check >\"${ARTIFACT_DIR}/searxng-e2e-health.txt\""
run "searxng --doctor-json >\"${ARTIFACT_DIR}/searxng-e2e-doctor.json\""
run "searxng --settings-json >\"${ARTIFACT_DIR}/searxng-e2e-settings.json\""
run "searxng --paths-json >\"${ARTIFACT_DIR}/searxng-e2e-paths.json\""
run "searxng --cache-status-json >\"${ARTIFACT_DIR}/searxng-e2e-cache.json\""
run "searxng --instance-info-json >\"${ARTIFACT_DIR}/searxng-e2e-instance.json\""
run "searxng health --json >\"${ARTIFACT_DIR}/searxng-e2e-health.json\""
run "searxng instance capabilities --json >\"${ARTIFACT_DIR}/searxng-e2e-capabilities.json\""
run "searxng instance config --json >\"${ARTIFACT_DIR}/searxng-e2e-config.json\""
run "searxng instance descriptions --json >\"${ARTIFACT_DIR}/searxng-e2e-descriptions.json\""
run "searxng instance stats --json >\"${ARTIFACT_DIR}/searxng-e2e-instance-stats.json\""
run "searxng instance errors --json >\"${ARTIFACT_DIR}/searxng-e2e-instance-errors.json\""
run "searxng instance manifest --json >\"${ARTIFACT_DIR}/searxng-e2e-manifest.json\""
if run "searxng instance metrics --raw >\"${ARTIFACT_DIR}/searxng-e2e-metrics.txt\" 2>\"${ARTIFACT_DIR}/searxng-e2e-metrics-error.txt\""; then
  METRICS_AVAILABLE=true
else
  METRICS_AVAILABLE=false
fi
SOURCE_STATUS_FILE="${ARTIFACT_DIR}/source-status.json"
if ! run "searxng instance source-status --json >\"$SOURCE_STATUS_FILE\""; then
  : # A stale or rate-limited upstream comparison is a valid, typed source-status result.
fi
run "searxng instance opensearch --raw >\"${ARTIFACT_DIR}/searxng-e2e-opensearch.xml\""
run "searxng instance robots --raw >\"${ARTIFACT_DIR}/searxng-e2e-robots.txt\""
run "searxng instance stats-page --raw >\"${ARTIFACT_DIR}/searxng-e2e-stats.html\""
run "searxng autocomplete \"$QUERY\" --json >\"${ARTIFACT_DIR}/searxng-e2e-autocomplete.json\""
run "searxng --schema-json all >\"${ARTIFACT_DIR}/searxng-e2e-schemas.json\""
run "searxng --verify-formats-json \"$QUERY\" >\"${ARTIFACT_DIR}/searxng-e2e-verify.json\""
run "searxng --request-json \"$QUERY\" >\"${ARTIFACT_DIR}/searxng-e2e-request.json\""
run "searxng --post --request-json \"$QUERY\" >\"${ARTIFACT_DIR}/searxng-e2e-post-request.json\""
run "searxng commands --json >\"${ARTIFACT_DIR}/searxng-e2e-commands.json\""
run "searxng --test >\"${ARTIFACT_DIR}/searxng-e2e-builtins.txt\""

run "searxng --format json --validate-output --limit 3 \"$QUERY\" >\"${ARTIFACT_DIR}/searxng-e2e-json-output.json\""
TOON_OUT="$(run "searxng --format toon --validate-output --limit 3 \"$QUERY\"")"
JSONL_OUT="$(run "searxng --format jsonl --validate-output --limit 3 \"$QUERY\"")"
CSV_OUT="$(run "searxng --format csv --validate-output --limit 3 \"$QUERY\"")"
RSS_OUT="$(run "searxng --post --no-cache --format rss --validate-output --limit 3 \"$QUERY\"")"
YAML_OUT="$(run "searxng --format yaml --validate-output --limit 3 \"$QUERY\"")"
XML_OUT="$(run "searxng --format xml --validate-output --limit 3 \"$QUERY\"")"
MD_OUT="$(run "searxng --format markdown --validate-output --limit 3 \"$QUERY\"")"
TABLE_OUT="$(run "searxng --format table --validate-output --limit 3 \"$QUERY\"")"
TEXT_OUT="$(run "searxng --format text --validate-output --limit 3 \"$QUERY\"")"
SIMPLE_OUT="$(run "searxng --format simple --validate-output --limit 3 \"$QUERY\"")"
HTML_OUT="$(run "searxng --format html --validate-output --limit 3 \"$QUERY\"")"
run "searxng --format raw --validate-output --limit 3 \"$QUERY\" >\"${ARTIFACT_DIR}/searxng-e2e-raw-output.json\""
cp "${ARTIFACT_DIR}/searxng-e2e-json-output.json" "${ARTIFACT_DIR}/searxng-e2e-payload.json"
run "searxng --validate-payload-json json \"${ARTIFACT_DIR}/searxng-e2e-payload.json\" >\"${ARTIFACT_DIR}/searxng-e2e-payload-check.json\""

if command -v jq >/dev/null 2>&1; then
  jq -e '.schemaVersion == "1.0" and .format == "json" and (.results | type == "array")' "${ARTIFACT_DIR}/searxng-e2e-json-output.json" >/dev/null
  jq -e '.query and (.results | type == "array")' "${ARTIFACT_DIR}/searxng-e2e-raw-output.json" >/dev/null
  jq -e '.format == "doctor" and .success == true and .failed == 0' "${ARTIFACT_DIR}/searxng-e2e-doctor.json" >/dev/null
  jq -e '.format == "format-verification" and .success == true' "${ARTIFACT_DIR}/searxng-e2e-verify.json" >/dev/null
  jq -e '.format == "settings" and .settings.searxngUrl == "'"$SEARXNG_URL"'"' "${ARTIFACT_DIR}/searxng-e2e-settings.json" >/dev/null
  jq -e '.format == "paths" and (.files.settings | test("/\\.searxng-cli/settings\\.json$"))' "${ARTIFACT_DIR}/searxng-e2e-paths.json" >/dev/null
  jq -e '.format == "cache-status" and .maxSize == "unlimited"' "${ARTIFACT_DIR}/searxng-e2e-cache.json" >/dev/null
  jq -e '.format == "instance-capabilities" and (.engines | type == "array")' "${ARTIFACT_DIR}/searxng-e2e-instance.json" >/dev/null
  jq -e '.format == "instance-health" and .endpoint == "/healthz" and .data.healthy == true' "${ARTIFACT_DIR}/searxng-e2e-health.json" >/dev/null
  jq -e '.format == "instance-capabilities" and (.data.engines | type == "array")' "${ARTIFACT_DIR}/searxng-e2e-capabilities.json" >/dev/null
  jq -e '.format == "instance-config" and .endpoint == "/config" and (.data | type == "object")' "${ARTIFACT_DIR}/searxng-e2e-config.json" >/dev/null
  jq -e '.format == "instance-descriptions" and .endpoint == "/engine_descriptions.json" and (.data | type == "object")' "${ARTIFACT_DIR}/searxng-e2e-descriptions.json" >/dev/null
  jq -e '.format == "instance-stats" and (.data.capabilities.engines | type == "array") and (.data.errors | type == "object")' "${ARTIFACT_DIR}/searxng-e2e-instance-stats.json" >/dev/null
  jq -e '.format == "instance-errors" and (.data | type == "object")' "${ARTIFACT_DIR}/searxng-e2e-instance-errors.json" >/dev/null
  jq -e '.format == "instance-manifest" and .endpoint == "/manifest.json" and (.data | type == "object")' "${ARTIFACT_DIR}/searxng-e2e-manifest.json" >/dev/null
  jq -e '.data as $data | .format == "instance-source-status" and .endpoint == "/config" and ($data.status == "current" or $data.status == "stale" or $data.status == "unavailable") and ($data.live.version | type == "string") and ($data.live.commit | type == "string") and (if $data.status == "current" then ($data.upstream.commit | startswith($data.live.commit)) else ($data.reason | type == "string") end)' "$SOURCE_STATUS_FILE" >/dev/null
  jq -e '.format == "autocomplete" and (.suggestions | type == "array")' "${ARTIFACT_DIR}/searxng-e2e-autocomplete.json" >/dev/null
  jq -e '.schemaVersion == "1.0" and (.formats | length > 5)' "${ARTIFACT_DIR}/searxng-e2e-schemas.json" >/dev/null
  jq -e '.format == "request" and (.request.url | startswith("'"$SEARXNG_URL"'"))' "${ARTIFACT_DIR}/searxng-e2e-request.json" >/dev/null
  jq -e '.format == "request" and .request.method == "POST" and (.request.url | endswith("/search")) and .request.params.q' "${ARTIFACT_DIR}/searxng-e2e-post-request.json" >/dev/null
  jq -e '.format == "cli-contracts" and .defaults.output == "toon" and .defaults.searchMethod == "get" and (.commands | length > 10)' "${ARTIFACT_DIR}/searxng-e2e-commands.json" >/dev/null
  jq -e '.format == "payload-validation" and .targetFormat == "json" and .valid == true' "${ARTIFACT_DIR}/searxng-e2e-payload-check.json" >/dev/null
else
  "$NODE_BIN" -e 'const d=require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-json-output.json","utf8"); const j=JSON.parse(d); if(j.schemaVersion!=="1.0"||j.format!=="json"||!Array.isArray(j.results)) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-raw-output.json","utf8"); const j=JSON.parse(d); if(!j.query||!Array.isArray(j.results)) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-doctor.json","utf8"); const j=JSON.parse(d); if(j.format!=="doctor"||!j.success||j.failed!==0) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-verify.json","utf8"); const j=JSON.parse(d); if(j.format!=="format-verification"||!j.success) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-settings.json","utf8"); const j=JSON.parse(d); if(j.format!=="settings"||j.settings.searxngUrl!==process.argv[1]) process.exit(1);' "$SEARXNG_URL"
  "$NODE_BIN" -e 'const d=require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-paths.json","utf8"); const j=JSON.parse(d); if(j.format!=="paths"||!/\\.searxng-cli\/settings\.json$/.test(j.files.settings)) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-cache.json","utf8"); const j=JSON.parse(d); if(j.format!=="cache-status"||j.maxSize!=="unlimited") process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-instance.json","utf8"); const j=JSON.parse(d); if(j.format!=="instance-capabilities"||!Array.isArray(j.engines)) process.exit(1);'
  "$NODE_BIN" -e 'const j=JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-health.json","utf8")); if(j.format!=="instance-health"||j.endpoint!=="/healthz"||j.data?.healthy!==true) process.exit(1);'
  "$NODE_BIN" -e 'const j=JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-capabilities.json","utf8")); if(j.format!=="instance-capabilities"||!Array.isArray(j.data?.engines)) process.exit(1);'
  "$NODE_BIN" -e 'const j=JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-config.json","utf8")); if(j.format!=="instance-config"||j.endpoint!=="/config"||typeof j.data!=="object") process.exit(1);'
  "$NODE_BIN" -e 'const j=JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-descriptions.json","utf8")); if(j.format!=="instance-descriptions"||j.endpoint!=="/engine_descriptions.json"||typeof j.data!=="object") process.exit(1);'
  "$NODE_BIN" -e 'const j=JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-instance-stats.json","utf8")); if(j.format!=="instance-stats"||!Array.isArray(j.data?.capabilities?.engines)||typeof j.data?.errors!=="object") process.exit(1);'
  "$NODE_BIN" -e 'const j=JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-instance-errors.json","utf8")); if(j.format!=="instance-errors"||typeof j.data!=="object") process.exit(1);'
  "$NODE_BIN" -e 'const j=JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-manifest.json","utf8")); if(j.format!=="instance-manifest"||j.endpoint!=="/manifest.json"||typeof j.data!=="object") process.exit(1);'
  "$NODE_BIN" -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); const d=j.data; if(j.format!=="instance-source-status"||j.endpoint!=="/config"||!["current","stale","unavailable"].includes(d?.status)||typeof d?.live?.version!=="string"||typeof d?.live?.commit!=="string"||(d.status==="current"&&!d.upstream?.commit?.startsWith(d.live.commit))||(d.status!=="current"&&typeof d.reason!=="string")) process.exit(1);' "$SOURCE_STATUS_FILE"
  "$NODE_BIN" -e 'const j=JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-autocomplete.json","utf8")); if(j.format!=="autocomplete"||!Array.isArray(j.suggestions)) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-schemas.json","utf8"); const j=JSON.parse(d); if(j.schemaVersion!=="1.0"||!Array.isArray(j.formats)||j.formats.length<6) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-request.json","utf8"); const j=JSON.parse(d); if(j.format!=="request"||!j.request.url.startsWith(process.argv[1])) process.exit(1);' "$SEARXNG_URL"
  "$NODE_BIN" -e 'const j=JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-post-request.json","utf8")); if(j.format!=="request"||j.request.method!=="POST"||!j.request.url.endsWith("/search")||!j.request.params.q) process.exit(1);'
  "$NODE_BIN" -e 'const j=JSON.parse(require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-commands.json","utf8")); if(j.format!=="cli-contracts"||j.defaults?.output!=="toon"||j.defaults?.searchMethod!=="get"||j.commands.length<=10) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync(process.env.ARTIFACT_DIR+"/searxng-e2e-payload-check.json","utf8"); const j=JSON.parse(d); if(j.format!=="payload-validation"||j.targetFormat!=="json"||j.valid!==true) process.exit(1);'
fi

rg -q 'OpenSearchDescription' "${ARTIFACT_DIR}/searxng-e2e-opensearch.xml"
rg -q '^User-agent:' "${ARTIFACT_DIR}/searxng-e2e-robots.txt"
rg -qi '<html' "${ARTIFACT_DIR}/searxng-e2e-stats.html"
if [ "$METRICS_AVAILABLE" = true ]; then
  rg -q '^(# HELP|# TYPE|[A-Za-z_:][A-Za-z0-9_:]*)' "${ARTIFACT_DIR}/searxng-e2e-metrics.txt"
else
  rg -q 'HTTP (401|404) from /metrics' "${ARTIFACT_DIR}/searxng-e2e-metrics-error.txt"
fi

printf '%s\n' "$JSONL_OUT" | while IFS= read -r line; do
  [ -z "$line" ] && continue
  "$NODE_BIN" -e 'JSON.parse(process.argv[1]);' "$line"
done

printf '%s\n' "$CSV_OUT" | head -n 1 | rg -q '^i,title,url,engine,score,text$'
printf '%s\n' "$RSS_OUT" | rg -q '^<\?xml version="1\.0" encoding="UTF-8"\?>'
printf '%s\n' "$RSS_OUT" | rg -q '<rss version="2\.0">'
printf '%s\n' "$YAML_OUT" | rg -q '^schemaVersion:'
printf '%s\n' "$YAML_OUT" | rg -q '^results:'
printf '%s\n' "$XML_OUT" | rg -q '^<\?xml version="1\.0"'
printf '%s\n' "$XML_OUT" | rg -q '<search '
printf '%s\n' "$MD_OUT" | rg -q '^# '
printf '%s\n' "$TABLE_OUT" | rg -q '\| # \|'
printf '%s\n' "$TEXT_OUT" | rg -q '\([0-9]+ results\)'
if [ -n "$SIMPLE_OUT" ]; then
  printf '%s\n' "$SIMPLE_OUT" | rg -q '^[0-9]+\. '
fi
printf '%s\n' "$HTML_OUT" | rg -q '<!DOCTYPE html>'
"$NODE_BIN" -e 'const { decode } = require("@toon-format/toon"); const d = decode(process.argv[1]); if (!d || typeof d.q !== "string" || !Array.isArray(d.results)) process.exit(1);' "$TOON_OUT"

echo "e2e-searxng passed"
