# Upstream Compatibility

SearXNG CLI follows the current SearXNG application contract and the official TOON reference
implementation. Every delivery must re-check the primary sources and the configured instance
instead of assuming that a public instance enables every optional response format.

## Primary Sources

- [SearXNG Search API](https://docs.searxng.org/dev/search_api.html)
- [SearXNG search model](https://docs.searxng.org/src/searx.search.html)
- [SearXNG application routes](https://github.com/searxng/searxng/blob/master/searx/webapp.py)
- [TOON reference implementation](https://github.com/toon-format/toon)
- [TOON specification](https://github.com/toon-format/spec)

## Search Contract

The CLI implements both official search transports: query-string GET by default and form-encoded
POST through `--post` or `--method post`. `--request-json` reports the selected method and keeps
the resolved params separate from the endpoint in POST mode. The CLI maps query, engines,
categories, language, page, safe search, and the day, week, month, and year time ranges to typed options. `--param`, `--sx`, `--sx-query`, `--params-json`, and
`--params-file` preserve access to additional instance-supported search parameters without waiting
for a CLI release.

The configured service can disable JSON search output. Search therefore requests JSON first and
falls back to HTML only when the response proves that the format is unavailable. Both paths feed
the same typed result and formatter contracts.

## Read-Only Resource Matrix

| CLI resource                 | SearXNG source                      | Default |
| ---------------------------- | ----------------------------------- | ------- |
| `instance capabilities`      | normalized `/config`                | TOON    |
| `instance engines`           | `/config` engines                   | TOON    |
| `instance categories`        | `/config` categories                | TOON    |
| `instance languages`         | `/config` locales/languages         | TOON    |
| `instance plugins`           | `/config` plugins                   | TOON    |
| `instance stats`             | `/config` plus `/stats/errors`      | TOON    |
| `instance errors`            | `/stats/errors`                     | TOON    |
| `instance health` / `health` | `/healthz`                          | TOON    |
| `instance config`            | `/config`                           | TOON    |
| `instance descriptions`      | `/engine_descriptions.json`         | TOON    |
| `instance metrics`           | `/metrics` Prometheus/OpenMetrics   | TOON    |
| `instance stats-page`        | `/stats`                            | TOON    |
| `instance opensearch`        | `/opensearch.xml`                   | TOON    |
| `instance manifest`          | `/manifest.json`                    | TOON    |
| `instance robots`            | `/robots.txt`                       | TOON    |
| `instance source-status`     | `/config` plus official GitHub head | TOON    |

Every resource supports a typed JSON envelope with `--json`, an exact upstream or normalized body
with `--raw`, and file capture with `--output <file>`. The envelope records schema version, format,
timestamp, source, endpoint, content type, and data.

SearXNG disables `/metrics` by default unless its administrator configures `general.open_metrics`.
For an enabled endpoint, supply the secret through `SEARXNG_OPEN_METRICS_PASSWORD` and optionally
set `SEARXNG_OPEN_METRICS_USERNAME` (default: `searxng-cli`). The CLI sends HTTP Basic
authentication without persisting the secret or printing it in request diagnostics. HTTP 401 means
the endpoint rejected missing or invalid credentials; HTTP 404 means the optional administrative
route is unavailable on the configured instance.

TOON output uses `@toon-format/toon` and is advertised as the provisional `text/toon` media type.
The current contract is TOON 4.1, including strict byte-order-mark, trailing-space, declared-length,
delimiter, and Unicode handling from the official reference implementation.

`instance source-status` compares the commit suffix in the configured service's `/config` version
with the current `searxng/searxng` `master` commit. It returns `current`, `stale`, or `unavailable`;
network or malformed-source failures are never mislabeled as stale. Both requests have a bounded
15-second timeout. The upstream request uses `GITHUB_TOKEN` or `GH_TOKEN` when available and reports
`upstream_rate_limited` separately from a general `upstream_unavailable` result.

## Release Verification

Run both suites before release:

```bash
bun run test:e2e
SEARXNG_URL=http://192.168.1.183:38522 bun run test:e2e:searxng
```

The second command packs and installs the project under an isolated prefix, asserts the resolved
`searxng` executable, applies local setup, and verifies search fallback, global state, unlimited
cache reporting, GET and POST search, every read-only resource, all formatter schemas including
RSS 2.0, agent command discovery, and the built-in acceptance
suite against the governed service.
