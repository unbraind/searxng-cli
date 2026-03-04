# Getting Started

## Installation

### Prerequisites

- **Bun 1.0.0+** (recommended) or Node.js 18.0.0+
- Access to a SearXNG instance

### Install Bun

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Windows
powershell -c "irm bun.sh/install.ps1 | iex"
```

### Install from npm

```bash
# Using bun (recommended)
bun install -g searxng-cli

# Using npm
npm install -g searxng-cli
```

### Install from source

```bash
git clone https://github.com/unbraind/searxng-cli.git
cd searxng-cli
bun install
bun run build
bun link
```

## Setup Wizard

On first interactive use, SearXNG CLI prompts the setup wizard automatically. You can also run it manually:

```bash
searxng --setup
```

For automation/agents, use non-interactive local bootstrap:

```bash
searxng --setup-local
```

`--setup-local` applies local agent defaults, checks connectivity, and refreshes
instance discovery cache (`~/.searxng-cli/engines.json`).

The setup wizard will guide you through:

1. **SearXNG URL** - Enter your SearXNG instance URL (tests connection automatically)
2. **Default Format** - Choose output format (toon, json, csv, etc.)
3. **Result Limit** - Set default number of results
4. **History Settings** - Enable/disable search history
5. **Display Settings** - Show/hide result scores
6. **Theme Selection** - Choose color theme
7. **Default SearXNG Params** - Persist URL-style passthrough params for every query
8. **Agent Optimization** - Enable TOON-first defaults for LLM/agent workflows

You can re-run the setup wizard anytime with `searxng --setup`.

## Quick Start

### Basic Search

```bash
searxng "your search query"
searxng search "your search query"
```

### Specify Output Format

```bash
searxng --format json "search query"
searxng search --format json "search query"
searxng -f markdown "search query"
```

### Search with Specific Engines

```bash
searxng --engines google,bing "search query"
searxng -e github "nodejs issues"
```

### Limit Results

```bash
searxng --limit 5 "search query"
searxng -n 20 "search query"
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARXNG_URL` | `http://localhost:8080` | SearXNG instance URL |
| `SEARXNG_TIMEOUT` | `15000` | Request timeout (ms) |
| `SEARXNG_MAX_RETRIES` | `2` | Max retry attempts |
| `NO_COLOR` | - | Disable colored output |
| `DEBUG` | - | Enable debug logging |

## Configuration Files

SearXNG CLI stores all configuration in `~/.searxng-cli/`:

| File | Description |
|------|-------------|
| `settings.json` | User settings (setup wizard) |
| `config.json` | Legacy configuration |
| `cache.json` | Search result cache |
| `history.json` | Search history |
| `bookmarks.json` | Saved bookmarks |
| `presets.json` | Search presets |

## First Run

On first run, SearXNG CLI will:

1. Create a configuration directory at `~/.searxng-cli/`
2. Connect to the configured SearXNG instance
3. Discover available engines and categories
4. Initialize the cache system

## Verify Installation

```bash
searxng --version
searxng version
searxng --health-check
searxng health
```

## View Current Settings

```bash
searxng --settings
```

## Next Steps

- [Usage Guide](./usage.md) - Learn all CLI options
- [Output Formats](./formats.md) - Explore output formats
- [Caching](./caching.md) - Understand caching
