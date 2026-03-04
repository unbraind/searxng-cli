# End-to-End Testing

This project includes a real CLI smoke test that executes the actual `searxng` command against a
live SearXNG instance.

## Run Full CLI E2E

```bash
bun run test:e2e:searxng
```

What this validates:

- local URL setup and TOON defaults
- health checks and doctor diagnostics
- settings/paths/cache/status machine outputs
- request envelope output (`--request-json`)
- instance capabilities (`--instance-info-json`)
- formatter schema catalog (`--schema-json all`)
- full format verification (`--verify-formats-json`)
- payload schema validation command (`--validate-payload-json`)
- built-in CLI self-tests (`searxng --test`)
- all formatter outputs with `--validate-output`:
  - `toon`, `json`, `jsonl`, `raw`, `csv`, `yaml`, `xml`, `markdown`, `table`, `text`, `simple`, `html`

## Environment Overrides

```bash
SEARXNG_URL=http://localhost:8080 bun run test:e2e:searxng
CMD_TIMEOUT=60s bun run test:e2e:searxng
E2E_QUERY="release verification query" bun run test:e2e:searxng
```

Supported env vars:

- `SEARXNG_URL`: target SearXNG base URL (default: `http://localhost:8080`)
- `CMD_TIMEOUT`: per-command timeout (default: `120s`)
- `TIMEOUT_BIN`: timeout command name (default: `timeout`)
- `E2E_QUERY`: query string used for smoke checks

## Release Gate

For the full release gate including build, tests, coverage, and live `searxng` checks:

```bash
bun run release:check
```
