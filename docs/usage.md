# Usage Guide

## Basic Syntax

```bash
searxng [command] [flags]
# commandless search remains supported:
searxng-cli [options] <query>
# alias:
searxng [options] <query>
```

## Command Mode

```bash
searxng search [flags] <query>
searxng setup [--local]
searxng settings [json]
searxng set <key> <value>
searxng cache <status|list|search|inspect|delete|clear|export|import|prune|help>
searxng formats <verify|schema|validate> [...]
searxng doctor [--json]
searxng health
searxng instance [info|json]
```

All commands support `--help` and global flags such as `--verbose`, `--silent`, `--format`,
`--output`, `--settings-json`, `--paths-json`, and `--no-cache`.

## Search Options

| Option                 | Short | Description                                            |
| ---------------------- | ----- | ------------------------------------------------------ |
| `--format <fmt>`       | `-f`  | Output format (default: toon)                          |
| `--engines <list>`     | `-e`  | Comma-separated search engines                         |
| `--lang <code>`        | `-l`  | Language code (en, de, fr, etc.)                       |
| `--page <n>`           | `-p`  | Page number (default: 1)                               |
| `--safe <level>`       | -     | Safe search: 0=off, 1=moderate, 2=strict               |
| `--time <range>`       | `-t`  | Time range: day, week, month, year                     |
| `--category <cat>`     | `-c`  | Category: general, images, videos, news, etc.          |
| `--limit <n>`          | `-n`  | Max results (default: 10, 0=all)                       |
| `--param <k=v>`        | -     | Pass through raw SearXNG query parameters (repeatable) |
| `--sx <k=v>`           | -     | Alias for `--param`                                     |
| `--sx-query <k=v&...>` | -     | URL-style SearXNG passthrough params in one argument    |
| `--sx-theme <name>`    | -     | Set upstream SearXNG `theme` query parameter           |
| `--sx-enabled-plugins <list>`  | -     | Set upstream `enabled_plugins` (comma-separated)  |
| `--sx-disabled-plugins <list>` | -     | Set upstream `disabled_plugins` (comma-separated) |
| `--sx-enabled-engines <list>`  | -     | Set upstream `enabled_engines` (comma-separated)  |
| `--sx-disabled-engines <list>` | -     | Set upstream `disabled_engines` (comma-separated) |
| `--sx-enabled-categories <list>`  | -  | Set upstream `enabled_categories` (comma-separated) |
| `--sx-disabled-categories <list>` | -  | Set upstream `disabled_categories` (comma-separated) |
| `--sx-image-proxy <bool>`      | -     | Set upstream `image_proxy` (`true`/`false`)       |
| `--params-json <obj>`  | -     | Pass through SearXNG params as JSON object             |
| `--params-file <path>` | -     | Load SearXNG params from JSON file                     |
| `--multi <q1;q2>`      | -     | Run multiple queries sequentially (separator: `;`/`||`) |
| `--autocomplete`       | -     | Fetch autocomplete suggestions from the SearXNG instance |
| `--engines-refresh`    | -     | Refresh local engines/categories cache from instance   |
| `--offline-first`      | -     | Cache-only mode (exact + semantic cache, no network)   |
| `--agent-json`         | -     | Agent mode with compact validated JSON output            |
| `--agent-ci`           | -     | `--agent` + `--strict` + `--offline-first` + `--validate-output` |
| `--request-json`       | -     | Print the resolved request envelope (URL + params) as JSON |

## Output Options

| Option              | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `--output <file>`   | Save results to file                                      |
| `--verbose`         | Show detailed request info                                |
| `--raw`             | Raw JSON output                                           |
| `--urls`            | Output only URLs                                          |
| `--titles`          | Output only titles                                        |
| `--compact`         | Compact JSON output                                       |
| `--pretty`          | Pretty-printed output                                     |
| `--text`            | Human-readable text formatter output                      |
| `--simple`          | Minimal numbered + URL formatter output                   |
| `--validate-output` | Validate output schema/format correctness before printing |
| `--offline-first`   | Return only cached results; skip network requests          |
| `--strict` / `--fail-on-empty` | Exit with code 2 when no search results are returned |

## Formatter Verification For CI

```bash
searxng --verify-formats "release candidate query"
searxng --verify-formats-json "release candidate query" | jq '.success'
searxng --doctor-json | jq '.checks[] | select(.ok == false)'
searxng --settings-json | jq '.settings.defaultFormat'
searxng --paths-json | jq '.files.cache'
searxng --cache-status-json | jq '.entries'
searxng --request-json "release candidate query" | jq '.request.params'
bun run test:e2e:searxng
```

- `--verify-formats` runs one live search, renders all supported output formats, and validates each.
- `--verify-formats-json` provides structured output for CI/CD and programmatic gates.
- `--doctor-json` provides machine-readable runtime diagnostics (settings, connectivity, formatter checks, cache policy).
- `--settings-json` provides machine-readable effective settings and resolved config paths.
- `--paths-json` provides machine-readable global file paths under `~/.searxng-cli/`.
- `--cache-status-json` provides machine-readable cache metrics for automation/CI.
- `--request-json` exposes the exact resolved search URL + query params before execution.

## Formatter Schemas For Automation

```bash
searxng --schema
searxng --schema-json json | jq '.schema.required'
searxng --schema-json jsonl | jq '.mimeType'
searxng --schema-json ndjson | jq '.mimeType'
```

- `--schema` prints the formatter schema catalog and required checks.
- `--schema-json <format>` returns machine-readable schema metadata for one format.

## Quick Mode

```bash
searxng-cli --quick "query"
searxng-cli -q "query"
```

Quick mode provides:

- 5 results max
- Minimal output
- Compact format

## AI Agent Mode

```bash
searxng-cli --agent "query"
searxng-cli --ai "query"
searxng-cli --agent-json "query"
searxng-cli --agent-ci "query"
```

Agent mode optimizes output for AI/LLM consumption:

- TOON format output
- Result analysis included
- Compact, efficient encoding
- `--agent-json` for machine-readable validated JSON in pipelines
- In `--agent-ci` mode, strict non-empty enforcement and cache-only deterministic execution

### New Agent Options

| Option          | Description                                                |
| --------------- | ---------------------------------------------------------- |
| `--citation`    | Output results as numbered citations [1], [2], etc.        |
| `--raw-content` | Include full (stripped) content in results (no truncation) |

### Examples

```bash
# Get results as citations for an LLM
searxng-cli --agent --citation "explain quantum physics"

# Include full content for deep analysis
searxng-cli --citation --raw-content "typescript 5.0 features"
```

## Search Aliases

Use bang-like syntax for quick engine/category selection:

| Alias     | Description                          |
| --------- | ------------------------------------ |
| `!gh`     | Search GitHub                        |
| `!so`     | Search StackOverflow                 |
| `!yt`     | Search YouTube                       |
| `!wiki`   | Search Wikipedia                     |
| `!reddit` | Search Reddit                        |
| `!g`      | Search Google                        |
| `!img`    | Image search                         |
| `!vid`    | Video search                         |
| `!news`   | News search                          |
| `!code`   | Code search (GitHub + StackOverflow) |

## Full SearXNG Feature Access

Use `--param` to pass any native SearXNG search parameter that is not explicitly mapped by the CLI:

```bash
searxng-cli --param image_proxy=true --param theme=simple "query"
searxng-cli --sx theme=simple --sx-query "enabled_plugins=Hash_plugin&image_proxy=true" "query"
searxng-cli --sx-theme simple --sx-image-proxy true "query"
searxng-cli --sx-enabled-plugins "Hash_plugin,Tracker_URL_remover" "query"
searxng-cli --sx-enabled-engines "google,bing" --sx-disabled-categories "music" "query"
searxng-cli --params-json '{"image_proxy":true,"theme":"simple"}' "query"
searxng-cli --params-file ./searxng-params.json "query"
```

For request safety and deterministic parsing, core request fields always stay canonical:
`q`, `format=json`, `pageno`, `safesearch`, `language`, `engines`, and `categories` are derived
from CLI options, while passthrough parameters are applied for all other SearXNG features.

### Examples

```bash
searxng-cli "!gh nodejs async"
searxng-cli "!so typescript generics"
searxng-cli "!wiki quantum computing"
```

## Engine Groups

Pre-defined engine groups for common use cases:

| Group      | Engines                                      |
| ---------- | -------------------------------------------- |
| `dev`      | github, stackoverflow, gitlab, reddit, devto |
| `ai`       | google, arxiv, scholar, duckduckgo           |
| `security` | github, cve, duckduckgo, google              |
| `docs`     | wikipedia, duckduckgo, google, stackoverflow |
| `social`   | reddit, twitter, mastodon, lemmy             |
| `shop`     | google, amazon, ebay, aliexpress             |

```bash
searxng-cli --group dev "async await"
searxng-cli -g ai "machine learning"
```

## Advanced Filtering

```bash
searxng-cli --domain example.com "query"
searxng-cli --exclude-domain spam.com "query"
searxng-cli --min-score 0.5 "query"
searxng-cli --has-image "query"
searxng-cli --date-after 2024-01-01 "query"
searxng-cli --date-before 2024-12-31 "query"
```

## Result Processing

```bash
searxng-cli --dedup "query"          # Deduplicate results (default)
searxng-cli --no-dedup "query"       # Keep duplicates
searxng-cli --sort "query"           # Sort by score
searxng-cli --rank "query"           # Rank and sort
```

## Interactive Mode

```bash
searxng-cli --interactive
searxng-cli -i
```

## Health and Status

```bash
searxng-cli --setup                 # Interactive setup wizard
searxng-cli --setup-local           # Non-interactive defaults + connectivity probe + instance cache warmup
searxng-cli --settings              # Show active settings from ~/.searxng-cli/settings.json
searxng-cli --settings-json         # Same settings in machine-readable JSON
searxng-cli --paths-json            # Managed ~/.searxng-cli file paths in JSON
searxng-cli --set-param k=v         # Persist default passthrough param in settings.json
searxng-cli --set-force-local-routing on  # Keep all searches pinned to local SearXNG
searxng-cli --set-force-local-agent-routing on  # Keep agent mode pinned to local SearXNG
searxng-cli --set-params-json '{"theme":"simple","image_proxy":true}'  # Replace defaults from JSON
searxng-cli --set-params-query 'enabled_plugins=Hash_plugin&theme=contrast' # Replace defaults from query
searxng-cli --unset-param key       # Remove one persisted passthrough param
searxng-cli --clear-params          # Clear all persisted passthrough params
searxng-cli --health-check          # Check connection health
searxng-cli --doctor                # Full release-readiness diagnostics
searxng-cli --doctor-json           # Same diagnostics in JSON for CI/JQ
searxng-cli --verify-formats        # Validate all formatter outputs
searxng-cli --verify-formats-json   # Same as JSON for CI/JQ
searxng-cli --request-json "q"      # Resolved request envelope for debugging/replay
searxng-cli --schema                # Human-readable formatter schema catalog
searxng-cli --schema-json toon      # Schema metadata for a specific formatter
searxng-cli --cache-status-json     # Cache status payload in JSON
searxng-cli --test                   # Run test suite
searxng-cli --info                   # Show instance info
searxng-cli --instance-info          # Show instance capabilities
searxng-cli --instance-info-json     # Capabilities in JSON
searxng-cli --suggestions            # Local recent/popular suggestions
searxng-cli --presets                # List saved presets
searxng-cli --preset dev-search "q"  # Apply named preset
searxng-cli --save-preset dev-search # Save current options as preset
```

## Examples

### Basic searches

```bash
searxng-cli "hello world"
searxng-cli -f json -n 5 "nodejs tutorial"
searxng-cli -e google,duckduckgo "privacy tools"
```

### Category searches

```bash
searxng-cli -c images "sunset photos"
searxng-cli -c news "technology today"
searxng-cli -c videos "coding tutorial"
```

### Time-limited searches

```bash
searxng-cli -t day "breaking news"
searxng-cli -t week "tech releases"
searxng-cli -t month "ai developments"
```

### Output to file

```bash
searxng-cli -o results.json -f json "query"
searxng-cli --export results.toon "query"
```

### Pipe mode

```bash
searxng-cli --pipe "query" | jq '.results[].url'
searxng-cli --silent "query" | xargs curl
```

### Multi-query and autocomplete

```bash
searxng-cli --multi "rust borrow checker;zig comptime;go generics" --toon
searxng-cli --autocomplete --json "openai api"
```
