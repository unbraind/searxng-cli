#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

bash scripts/version-check.sh
bun run clean
bun run build
bun run typecheck
bun run test
echo "Running coverage suite (full, includes E2E)..."
bun run test:coverage

bun link

searxng --set-url http://localhost:8080
searxng --set-format toon

searxng --health-check
searxng --instance-info-json >/tmp/searxng-instance-info.json
searxng --cache-status >/tmp/searxng-cache-status.txt
searxng --cache-status-json >/tmp/searxng-cache-status.json
searxng --paths-json >/tmp/searxng-paths.json
searxng --schema-json json >/tmp/searxng-schema-json.json
searxng --test

searxng "release readiness smoke test" --json --limit 2 --validate-output >/tmp/searxng-release-json-output.json
cp /tmp/searxng-release-json-output.json /tmp/searxng-payload.json
searxng --validate-payload-json json /tmp/searxng-payload.json >/tmp/searxng-payload-check.json
if command -v jq >/dev/null 2>&1; then
  jq -e '.schemaVersion == "1.0" and .format == "json" and (.results | type == "array")' /tmp/searxng-release-json-output.json >/dev/null
  jq -e '.format == "payload-validation" and .targetFormat == "json" and .valid == true' /tmp/searxng-payload-check.json >/dev/null
else
  node -e 'const data = JSON.parse(require("fs").readFileSync("/tmp/searxng-release-json-output.json","utf8")); if (data.schemaVersion !== "1.0" || data.format !== "json" || !Array.isArray(data.results)) process.exit(1);'
  node -e 'const data = JSON.parse(require("fs").readFileSync("/tmp/searxng-payload-check.json","utf8")); if (data.format !== "payload-validation" || data.targetFormat !== "json" || data.valid !== true) process.exit(1);'
fi

TOON_OUT="$(searxng "release readiness smoke test" --toon --limit 2 --validate-output)"
node -e 'const { decode } = require("@toon-format/toon"); const d = decode(process.argv[1]); if (!d || typeof d.q !== "string" || !Array.isArray(d.results)) process.exit(1);' "$TOON_OUT"

node -e 'const schema = JSON.parse(require("fs").readFileSync("/tmp/searxng-schema-json.json","utf8")); if (schema.format !== "json" || schema.mimeType !== "application/json" || !Array.isArray(schema.requiredChecks)) process.exit(1);'

YAML_OUT="$(searxng "release readiness smoke test" --format yaml --limit 2 --validate-output)"
printf '%s\n' "$YAML_OUT" | rg -q '^schemaVersion:'
printf '%s\n' "$YAML_OUT" | rg -q '^results:'

XML_OUT="$(searxng "release readiness smoke test" --format xml --limit 2 --validate-output)"
printf '%s\n' "$XML_OUT" | rg -q '^<\?xml version="1\.0"'
printf '%s\n' "$XML_OUT" | rg -q '<search '

CSV_OUT="$(searxng "release readiness smoke test" --format csv --limit 2 --validate-output)"
printf '%s\n' "$CSV_OUT" | head -n 1 | rg -q '^i,title,url,engine,score,text$'

node -e 'const data = JSON.parse(require("fs").readFileSync("/tmp/searxng-cache-status.json","utf8")); if (data.format !== "cache-status" || typeof data.entries !== "number") process.exit(1);'
node -e 'const data = JSON.parse(require("fs").readFileSync("/tmp/searxng-paths.json","utf8")); if (data.format !== "paths" || !data.files || typeof data.files.settings !== "string") process.exit(1);'

echo "release:check passed"
