# SearXNG CLI

A powerful TypeScript command-line search client for SearXNG instances with TOON format as default output, persistent caching, and AI agent mode.

[![npm version](https://badge.fury.io/js/searxng-cli.svg)](https://badge.fury.io/js/searxng-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Runtime-Bun-black?logo=bun)](https://bun.sh)

## Features

- **TOON Format Default** - Token-Oriented Object Notation for LLM-friendly output (~40% fewer tokens)
- **Interactive Setup Wizard** - Easy first-time configuration with connection testing
- **First-Run Auto Setup** - Interactive sessions prompt setup automatically when not configured
- **Settings Bootstrap** - `~/.searxng-cli/settings.json` is auto-created with safe defaults
- **Global Data Bootstrap** - all managed `~/.searxng-cli/*` files are auto-initialized
- **Persistent Caching** - Unlimited local cache (no in-memory cap), disk persistence, and compression
- **Multiple Output Formats** - JSON, CSV, Markdown, YAML, XML, HTML, table, text, and more
- **AI Agent Mode** - Optimized for AI/LLM consumption with structured metadata
- **Local Agent Routing Guard** - Agent mode defaults to local `http://localhost:8080` routing (`forceLocalAgentRouting: true`)
- **Agent CI Mode** - `--agent-ci` for strict, offline-first, validated TOON output
- **Offline-First Agent Mode** - `--offline-first` for deterministic cache-only workflows
- **Doctor Diagnostics** - `--doctor` runs connectivity, settings, and formatter validation checks
- **Doctor JSON Diagnostics** - `--doctor-json` emits machine-readable diagnostics for CI/agents
- **Formatter Verification** - `--verify-formats-json` emits machine-readable format validation status for CI
- **Formatter Schemas** - `--schema-json` exposes machine-readable output contracts for each formatter
- **Output Provenance Metadata** - machine formats include source instance URL + generation timestamp
- **Settings JSON** - `--settings-json` emits effective settings + resolved config paths for automation
- **Paths JSON** - `--paths-json` exposes all managed `~/.searxng-cli/*` file locations
- **Cache Status JSON** - `--cache-status-json` exposes cache state for CI/agents
- **Full TypeScript** - 100% type-safe implementation with comprehensive type exports
- **Privacy-Focused** - Connect to your own SearXNG instance
- **Search Aliases** - Quick engine selection with `!gh`, `!so`, etc.
- **Advanced Filtering** - Domain, date, score, and image filters
- **Autocomplete + Multi-Query** - Built-in `--autocomplete` and `--multi` workflows
- **Preset Workflows** - Save/load reusable search profiles with `--save-preset`, `--preset`, `--presets`
- **Connection Resilience** - Circuit breaker, adaptive timeouts, request retries
- **Built with Bun** - Fast development and runtime using Bun
- **Global Settings** - Settings saved to `~/.searxng-cli/settings.json`
- **Global SearXNG Params** - Persist default passthrough params with single-key or bulk commands
- **SearXNG Feature Parity** - Use `--param`, `--params-json`, and `--params-file` to pass any upstream SearXNG query parameter

## Installation

```bash
# Using bun (recommended)
bun install -g searxng-cli

# Using npm
npm install -g searxng-cli

# One-off usage without installing globally
npx searxng-cli "query"
bunx searxng-cli "query"
npx searxng "query"
bunx searxng "query"
```

## Quick Start

```bash
# Command-style help (recommended)
searxng search --help
searxng cache --help
searxng settings --help

# Run the setup wizard (recommended for first use)
searxng --setup

# Or apply local agent defaults non-interactively
searxng --setup-local

# Basic search (TOON format by default)
searxng "your search query"
searxng search "your search query"

# JSON output
searxng --format json "query"

# Search with specific engines
searxng --engines google,bing "query"

# AI Agent mode
searxng --agent "query"

# Agent JSON mode (validated + compact machine output)
searxng --agent-json "query" | jq '.results'

# Agent CI mode (strict + offline-first + validated output)
searxng --agent-ci "query"

# Cache-only retrieval for deterministic agents
searxng --offline-first "query"

# Release-readiness diagnostics
searxng --doctor
searxng doctor
searxng --doctor-json | jq '.checks[] | select(.ok == false)'
searxng --settings-json | jq '.settings.searxngUrl'
searxng --set-force-local-routing on
searxng --set-force-local-agent-routing on
searxng --paths-json | jq '.files'
searxng --cache-status-json | jq '.maxSize'
bun run secrets:history
bun run release:dry-run

# Validate all formatter schemas in one command (JSON for CI)
searxng --verify-formats-json "release check" | jq '.formats[] | select(.valid == false)'
searxng --schema-json json | jq '.schema'
```

`--setup-local` also runs a local connectivity probe and primes
`~/.searxng-cli/engines.json` for faster first-run agent workflows.

`searxng-cli` remains available as an alias, but `searxng` is the recommended command.

## Versioning

The project uses:

- `YYYY.M.D` for the first release on a UTC day
- `YYYY.M.D-N` for release 2+ on that same UTC day (`N` = release number)

Examples:

- `2026.3.4`
- `2026.3.4-2`

## Setup Wizard

The interactive setup wizard helps you configure SearXNG CLI on first use:

```bash
searxng-cli --setup
```

The wizard will:

1. Test your SearXNG instance connection
2. Configure default output format
3. Set result limit preferences
4. Configure history settings
5. Choose color theme
6. Configure default SearXNG passthrough parameters
7. Enable AI agent defaults

You can re-run it anytime to update your settings.

## Usage

### Basic Syntax

```bash
searxng [command] [flags]
# commandless search remains supported:
searxng-cli [options] <query>
```

Common commands:

- `search` - run searches (`searxng search [flags] <query>`)
- `setup` - interactive or local bootstrap setup (`searxng setup [--local]`)
- `settings` - effective settings (`searxng settings` / `searxng settings json`)
- `set` - update global defaults (`searxng set <key> <value>`)
- `cache` - cache operations (`searxng cache status|list|clear|...`)
- `formats` - formatter verification/schema/validation
- `doctor` / `health` / `instance` - diagnostics and capability inspection

### Search Options

| Option                 | Short | Description                                        |
| ---------------------- | ----- | -------------------------------------------------- |
| `--format <fmt>`       | `-f`  | Output format (default: toon)                      |
| `--engines <list>`     | `-e`  | Comma-separated search engines                     |
| `--lang <code>`        | `-l`  | Language code                                      |
| `--page <n>`           | `-p`  | Page number                                        |
| `--safe <level>`       | -     | Safe search: 0, 1, or 2                            |
| `--time <range>`       | `-t`  | Time range: day, week, month, year                 |
| `--category <cat>`     | `-c`  | Category: general, images, videos, news            |
| `--limit <n>`          | `-n`  | Max results (default: 10)                          |
| `--param <k=v>`        | -     | Pass through raw SearXNG query params (repeatable) |
| `--sx <k=v>`           | -     | Alias for `--param` |
| `--sx-query <k=v&...>` | -     | URL-style SearXNG passthrough params in one argument |
| `--sx-theme <name>`    | -     | Set upstream SearXNG `theme` query parameter       |
| `--sx-enabled-plugins <list>`  | -     | Set upstream `enabled_plugins` (comma-separated) |
| `--sx-disabled-plugins <list>` | -     | Set upstream `disabled_plugins` (comma-separated) |
| `--sx-enabled-engines <list>`  | -     | Set upstream `enabled_engines` (comma-separated) |
| `--sx-disabled-engines <list>` | -     | Set upstream `disabled_engines` (comma-separated) |
| `--sx-enabled-categories <list>`  | -  | Set upstream `enabled_categories` (comma-separated) |
| `--sx-disabled-categories <list>` | -  | Set upstream `disabled_categories` (comma-separated) |
| `--sx-image-proxy <bool>`      | -     | Set upstream `image_proxy` (`true`/`false`)      |
| `--params-json <obj>`  | -     | Pass through SearXNG params as JSON object         |
| `--params-file <path>` | -     | Load SearXNG params from JSON file                 |
| `--multi <q1;q2>`      | -     | Run multiple queries sequentially                  |
| `--autocomplete`       | -     | Return SearXNG autocomplete suggestions            |
| `--offline-first`      | -     | Cache-only mode (exact+semantic cache, no network) |
| `--strict` / `--fail-on-empty` | - | Exit code `2` when a search returns zero results |

### Output Formats

| Format                 | Description                                             |
| ---------------------- | ------------------------------------------------------- |
| `toon`                 | Token-Oriented Object Notation (default, LLM-optimized) |
| `json`                 | JSON format                                             |
| `jsonl`                | JSON Lines / NDJSON (one result object per line)        |
| `ndjson`               | Alias for `jsonl`                                        |
| `csv`                  | Comma-separated values                                  |
| `markdown` / `md`      | Markdown format                                         |
| `yaml` / `yml`         | YAML format                                             |
| `table`                | ASCII table                                             |
| `xml`                  | XML format                                              |
| `html` / `html-report` | Standalone HTML page                                    |
| `text` / `simple`      | Plain text                                              |

### Search Aliases

```bash
searxng-cli "!gh nodejs"          # Search GitHub
searxng-cli "!so typescript"      # Search StackOverflow
searxng-cli "!wiki python"        # Search Wikipedia
searxng-cli "!yt tutorial"        # Search YouTube
searxng-cli "!img sunset"         # Image search
searxng-cli "!news technology"    # News search
```

### Cache Management

```bash
searxng-cli --cache               # Show cache status
searxng-cli --cache-list          # List cached entries
searxng-cli --cache-search "term" # Search cache
searxng-cli --cache-clear         # Clear cache
searxng-cli --cache-export file   # Export cache
searxng-cli --cache-import file   # Import cache
```

Cache behavior defaults:

- `CACHE_MAX_AGE=Infinity`
- unlimited in-memory cache (`LRU_CACHE_SIZE=0`, no eviction cap)

### AI Agent Mode

```bash
searxng-cli --agent "query"       # LLM-optimized output
searxng-cli --ai "query"          # Same as --agent
searxng-cli --agent-json "query"  # LLM mode with validated compact JSON
searxng-cli --agent-ci "query"    # Strict offline-first validated agent mode
searxng-cli --analyze "query"     # Include result analysis
```

### Utility Commands

```bash
searxng-cli --version             # Show version
searxng-cli --help                # Show help
searxng-cli --setup               # Run setup wizard
searxng-cli --setup-local         # Local defaults bootstrap (non-interactive)
searxng-cli --settings            # Show current settings
searxng-cli --settings-json       # Same settings in machine-readable JSON
searxng-cli --paths-json          # Managed ~/.searxng-cli file paths as JSON
searxng-cli --health-check        # Check server health
searxng-cli --instance-info       # Show instance capabilities
searxng-cli --instance-info-json  # Same in JSON
searxng-cli --suggestions         # Show local recent/popular suggestions
searxng-cli --presets             # List saved presets
searxng-cli --preset dev "query"  # Apply preset
searxng-cli --save-preset dev     # Save current options as preset
searxng-cli --test                # Run test suite
searxng-cli --bookmarks           # List bookmarks
searxng-cli --history             # Show search history
searxng-cli --config show         # Show configuration
searxng-cli --engines-refresh     # Refresh engines/categories cache
searxng-cli --doctor              # Full release-readiness diagnostics
searxng-cli --doctor-json         # Same diagnostics in machine-readable JSON
searxng-cli --verify-formats      # Validate all formatter outputs
searxng-cli --verify-formats-json # Same as JSON for CI/JQ
searxng-cli --schema              # Human-readable formatter schema catalog
searxng-cli --schema-json json    # Schema metadata for one format
searxng-cli --validate-payload-json json --input ./result.json
searxng-cli --cache-status-json   # Cache status in machine-readable JSON
```

### Output Validation For CI

```bash
searxng --format json --validate-output "query" | jq '.results'
searxng --format jsonl --validate-output "query" | jq -R 'fromjson?'
searxng --format ndjson --validate-output "query" | jq -R 'fromjson?'
searxng --format csv --validate-output "query" > out.csv
searxng --format toon --validate-output "query"
searxng --format yaml --validate-output "query"
searxng --format html --validate-output "query" > report.html
searxng --format html-report --validate-output "query" > report.html
searxng --strict --json "highly-specific-query" || echo "no results"
searxng --verify-formats-json "query" | jq '.success'
```

Machine outputs include reproducibility metadata:
- JSON/JSONL/YAML/XML: `source`, `generatedAt`
- TOON: `src`, `ts`

## Configuration

### Setup Wizard

```bash
searxng-cli --setup
```

### View Settings

```bash
searxng-cli --settings
```

### Environment Variables

| Variable              | Default                      | Description            |
| --------------------- | ---------------------------- | ---------------------- |
| `SEARXNG_URL`         | `http://localhost:8080` | SearXNG instance URL   |
| `SEARXNG_TIMEOUT`     | `15000`                      | Request timeout (ms)   |
| `SEARXNG_MAX_RETRIES` | `2`                          | Max retry attempts     |
| `NO_COLOR`            | -                            | Disable colored output |
| `DEBUG`               | -                            | Enable debug logging   |

### Configuration Files

Settings are stored in `~/.searxng-cli/`:

| File             | Description                       |
| ---------------- | --------------------------------- |
| `settings.json`  | User settings (from setup wizard) |
| `config.json`    | Legacy configuration              |
| `cache.json`     | Search result cache               |
| `history.json`   | Search history                    |
| `bookmarks.json` | Saved bookmarks                   |

Edit `~/.searxng-cli/settings.json`:

```json
{
  "searxngUrl": "http://localhost:8080",
  "defaultSearxngParams": {},
  "forceLocalAgentRouting": true,
  "defaultLimit": 10,
  "defaultFormat": "toon",
  "defaultTimeout": 15000,
  "saveHistory": true,
  "maxHistory": 100,
  "theme": "default"
}
```

## TOON Format

TOON (Token-Oriented Object Notation) is the default output format, optimized for LLM consumption:

```
tv: 3.0
v: 2026.3.4
q: search query
n: 10
total: 1000000
results[10]{i,title,url,engine,score,snippet}:
  1,Example Title,https://example.com,google,0.9,Page snippet text here...
  2,Another Result,https://another.com,bing,0.8,Another snippet...
answers[1]: Direct answer if available
suggestions[2]: suggestion 1,suggestion 2
domains:
  example.com: 5
  another.com: 3
```

Fields: `tv` (TOON spec version), `v` (CLI version), `q` (query), `n` (count), `c: 1` (cached), `ca:` (cache age), `total:` (available),
`results[]` (array of results), `answers[]` (array of answers), `infobox:` (infobox), `suggestions[]` (array of suggestions), `domains:` (domains).
Use `--agent` or `--compact` for even smaller output (omits suggestions, infoboxes, domains).

## Examples

```bash
# Basic search
searxng-cli "hello world"

# JSON output with 5 results
searxng-cli -f json -n 5 "nodejs tutorial"

# Full SearXNG passthrough params
searxng-cli --param image_proxy=true --param theme=simple "query"
searxng-cli --sx-theme simple --sx-image-proxy true "query"
searxng-cli --sx-enabled-plugins "Hash_plugin,Tracker_URL_remover" "query"
searxng-cli --sx-enabled-engines "google,bing" --sx-disabled-categories "music" "query"
searxng-cli --params-json '{"image_proxy":true,"theme":"simple"}' "query"
searxng-cli --params-file ./searxng-params.json "query"
searxng-cli --set-param theme=simple
searxng-cli --set-params-json '{"theme":"simple","image_proxy":true}'
searxng-cli --set-params-query 'enabled_plugins=Hash_plugin&theme=contrast'
searxng-cli --unset-param theme
searxng-cli --clear-params

# Autocomplete suggestions in JSON
searxng-cli --autocomplete --json "openai api"

# Run multiple queries in one call
searxng-cli --multi "rust lifetimes;typescript decorators" --toon

# Search GitHub for code
searxng-cli "!gh async await pattern"

# News from the past week
searxng-cli -c news -t week "AI developments"

# Save results to file
searxng-cli -o results.json -f json "query"

# Quick search (5 results, minimal output)
searxng-cli -q "rust programming"

# AI agent mode
searxng-cli --agent "latest TypeScript features"
```

## Documentation

- [Getting Started](./docs/getting-started.md)
- [Usage Guide](./docs/usage.md)
- [Output Formats](./docs/formats.md)
- [Caching](./docs/caching.md)
- [Configuration](./docs/configuration.md)
- [End-to-End Testing](./docs/e2e-testing.md)
- [Release Process](./docs/release-process.md)
- [API Reference](./docs/api.md)
- [Development Guide](./docs/development.md)
- [Agent Mode](./docs/agent-mode.md)
- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)

## Development

This project is built with [Bun](https://bun.sh) - a fast all-in-one JavaScript runtime.

```bash
# Clone and install
git clone https://github.com/unbraind/searxng-cli.git
cd searxng-cli
bun install

# Build
bun run build

# Sync/check next release version for today
bun run version:sync
bun run version:check

# Test
bun run test
bun run test:unit
bun run test:coverage
bun run test:e2e:searxng
bun run smoke:package
bun run release:dry-run

# Development
bun run dev "query"

# Lint
bun run lint
```

## Requirements

- **Bun 1.0.0+** (recommended) - [Install Bun](https://bun.sh/docs/installation)
- Node.js 18.0.0+ (alternative)
- Access to a SearXNG instance

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [TOON Format Specification](https://toonformat.dev)
- [SearXNG Project](https://searxng.org)
- [GitHub Repository](https://github.com/unbraind/searxng-cli)
