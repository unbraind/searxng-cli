#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SEARXNG_URL="${SEARXNG_URL:-http://localhost:8080}"
TIMEOUT_BIN="${TIMEOUT_BIN:-timeout}"
CMD_TIMEOUT="${CMD_TIMEOUT:-120s}"
QUERY="${E2E_QUERY:-searxng cli full e2e smoke test}"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"

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
bun link >/dev/null

run "searxng --set-url \"$SEARXNG_URL\""
run "searxng --set-format toon"
run "searxng --setup-local"
run "searxng --health-check >/tmp/searxng-e2e-health.txt"
run "searxng --doctor-json >/tmp/searxng-e2e-doctor.json"
run "searxng --settings-json >/tmp/searxng-e2e-settings.json"
run "searxng --paths-json >/tmp/searxng-e2e-paths.json"
run "searxng --cache-status-json >/tmp/searxng-e2e-cache.json"
run "searxng --instance-info-json >/tmp/searxng-e2e-instance.json"
run "searxng --schema-json all >/tmp/searxng-e2e-schemas.json"
run "searxng --verify-formats-json \"$QUERY\" >/tmp/searxng-e2e-verify.json"
run "searxng --request-json \"$QUERY\" >/tmp/searxng-e2e-request.json"
run "searxng --test >/tmp/searxng-e2e-builtins.txt"

run "searxng --format json --validate-output --limit 3 \"$QUERY\" >/tmp/searxng-e2e-json-output.json"
TOON_OUT="$(run "searxng --format toon --validate-output --limit 3 \"$QUERY\"")"
JSONL_OUT="$(run "searxng --format jsonl --validate-output --limit 3 \"$QUERY\"")"
CSV_OUT="$(run "searxng --format csv --validate-output --limit 3 \"$QUERY\"")"
YAML_OUT="$(run "searxng --format yaml --validate-output --limit 3 \"$QUERY\"")"
XML_OUT="$(run "searxng --format xml --validate-output --limit 3 \"$QUERY\"")"
MD_OUT="$(run "searxng --format markdown --validate-output --limit 3 \"$QUERY\"")"
TABLE_OUT="$(run "searxng --format table --validate-output --limit 3 \"$QUERY\"")"
TEXT_OUT="$(run "searxng --format text --validate-output --limit 3 \"$QUERY\"")"
SIMPLE_OUT="$(run "searxng --format simple --validate-output --limit 3 \"$QUERY\"")"
HTML_OUT="$(run "searxng --format html --validate-output --limit 3 \"$QUERY\"")"
run "searxng --format raw --validate-output --limit 3 \"$QUERY\" >/tmp/searxng-e2e-raw-output.json"
cp /tmp/searxng-e2e-json-output.json /tmp/searxng-e2e-payload.json
run "searxng --validate-payload-json json /tmp/searxng-e2e-payload.json >/tmp/searxng-e2e-payload-check.json"

if command -v jq >/dev/null 2>&1; then
  jq -e '.schemaVersion == "1.0" and .format == "json" and (.results | type == "array")' /tmp/searxng-e2e-json-output.json >/dev/null
  jq -e '.query and (.results | type == "array")' /tmp/searxng-e2e-raw-output.json >/dev/null
  jq -e '.format == "doctor" and .success == true and .failed == 0' /tmp/searxng-e2e-doctor.json >/dev/null
  jq -e '.format == "format-verification" and .success == true' /tmp/searxng-e2e-verify.json >/dev/null
  jq -e '.format == "settings" and .settings.searxngUrl == "'"$SEARXNG_URL"'"' /tmp/searxng-e2e-settings.json >/dev/null
  jq -e '.format == "paths" and (.files.settings | test("/\\.searxng-cli/settings\\.json$"))' /tmp/searxng-e2e-paths.json >/dev/null
  jq -e '.format == "cache-status" and .maxSize == "unlimited"' /tmp/searxng-e2e-cache.json >/dev/null
  jq -e '.format == "instance-capabilities" and (.engines | type == "array")' /tmp/searxng-e2e-instance.json >/dev/null
  jq -e '.schemaVersion == "1.0" and (.formats | length > 5)' /tmp/searxng-e2e-schemas.json >/dev/null
  jq -e '.format == "request" and (.request.url | startswith("'"$SEARXNG_URL"'"))' /tmp/searxng-e2e-request.json >/dev/null
  jq -e '.format == "payload-validation" and .targetFormat == "json" and .valid == true' /tmp/searxng-e2e-payload-check.json >/dev/null
else
  "$NODE_BIN" -e 'const d=require("fs").readFileSync("/tmp/searxng-e2e-json-output.json","utf8"); const j=JSON.parse(d); if(j.schemaVersion!=="1.0"||j.format!=="json"||!Array.isArray(j.results)) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync("/tmp/searxng-e2e-raw-output.json","utf8"); const j=JSON.parse(d); if(!j.query||!Array.isArray(j.results)) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync("/tmp/searxng-e2e-doctor.json","utf8"); const j=JSON.parse(d); if(j.format!=="doctor"||!j.success||j.failed!==0) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync("/tmp/searxng-e2e-verify.json","utf8"); const j=JSON.parse(d); if(j.format!=="format-verification"||!j.success) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync("/tmp/searxng-e2e-settings.json","utf8"); const j=JSON.parse(d); if(j.format!=="settings"||j.settings.searxngUrl!==process.argv[1]) process.exit(1);' "$SEARXNG_URL"
  "$NODE_BIN" -e 'const d=require("fs").readFileSync("/tmp/searxng-e2e-paths.json","utf8"); const j=JSON.parse(d); if(j.format!=="paths"||!/\\.searxng-cli\/settings\.json$/.test(j.files.settings)) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync("/tmp/searxng-e2e-cache.json","utf8"); const j=JSON.parse(d); if(j.format!=="cache-status"||j.maxSize!=="unlimited") process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync("/tmp/searxng-e2e-instance.json","utf8"); const j=JSON.parse(d); if(j.format!=="instance-capabilities"||!Array.isArray(j.engines)) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync("/tmp/searxng-e2e-schemas.json","utf8"); const j=JSON.parse(d); if(j.schemaVersion!=="1.0"||!Array.isArray(j.formats)||j.formats.length<6) process.exit(1);'
  "$NODE_BIN" -e 'const d=require("fs").readFileSync("/tmp/searxng-e2e-request.json","utf8"); const j=JSON.parse(d); if(j.format!=="request"||!j.request.url.startsWith(process.argv[1])) process.exit(1);' "$SEARXNG_URL"
  "$NODE_BIN" -e 'const d=require("fs").readFileSync("/tmp/searxng-e2e-payload-check.json","utf8"); const j=JSON.parse(d); if(j.format!=="payload-validation"||j.targetFormat!=="json"||j.valid!==true) process.exit(1);'
fi

printf '%s\n' "$JSONL_OUT" | while IFS= read -r line; do
  [ -z "$line" ] && continue
  "$NODE_BIN" -e 'JSON.parse(process.argv[1]);' "$line"
done

printf '%s\n' "$CSV_OUT" | head -n 1 | rg -q '^i,title,url,engine,score,text$'
printf '%s\n' "$YAML_OUT" | rg -q '^schemaVersion:'
printf '%s\n' "$YAML_OUT" | rg -q '^results:'
printf '%s\n' "$XML_OUT" | rg -q '^<\?xml version="1\.0"'
printf '%s\n' "$XML_OUT" | rg -q '<search '
printf '%s\n' "$MD_OUT" | rg -q '^# '
printf '%s\n' "$TABLE_OUT" | rg -q '\| # \|'
printf '%s\n' "$TEXT_OUT" | rg -q '\([0-9]+ results\)'
printf '%s\n' "$SIMPLE_OUT" | rg -q '^[0-9]+\. '
printf '%s\n' "$HTML_OUT" | rg -q '<!DOCTYPE html>'
"$NODE_BIN" -e 'const { decode } = require("@toon-format/toon"); const d = decode(process.argv[1]); if (!d || typeof d.q !== "string" || !Array.isArray(d.results)) process.exit(1);' "$TOON_OUT"

echo "e2e-searxng passed"
