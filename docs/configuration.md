# Configuration

SearXNG CLI can be configured through environment variables, configuration files, and command-line options.

`searxng` and `searxng-cli` are both supported command names. Examples below use `searxng`.

## Setup Wizard

The easiest way to configure SearXNG CLI is using the interactive setup wizard:

```bash
searxng --setup
```

This will guide you through configuring:
- SearXNG instance URL (with connection test)
- Default output format
- Default result limit
- History settings
- Display preferences
- Color theme
- Default SearXNG passthrough params (`k=v&k2=v2`)
- Agent optimization defaults

## Settings File

Location: `~/.searxng-cli/settings.json`

### Default Settings

```json
{
  "searxngUrl": "http://localhost:8080",
  "defaultSearxngParams": {},
  "forceLocalAgentRouting": true,
  "defaultLimit": 10,
  "defaultFormat": "toon",
  "defaultTimeout": 15000,
  "autoUnescape": true,
  "autoFormat": true,
  "colorize": true,
  "showScores": true,
  "saveHistory": true,
  "maxHistory": 100,
  "defaultEngines": null,
  "defaultCategory": null,
  "theme": "default",
  "lastSetupVersion": "2026.3.4",
  "setupCompletedAt": "2024-01-01T00:00:00.000Z"
}
```

### View Current Settings

```bash
searxng --settings
```

### Manage Default Passthrough Params

```bash
searxng --set-param theme=simple
searxng --set-params-json '{"theme":"simple","image_proxy":true}'
searxng --set-params-query 'enabled_plugins=Hash_plugin&theme=contrast'
searxng --unset-param theme
searxng --clear-params
```

## Configuration File (Legacy)

Location: `~/.searxng-cli/config.json`

### Default Configuration

```json
{
  "defaultLimit": 10,
  "defaultFormat": "toon",
  "defaultTimeout": 15000,
  "autoUnescape": true,
  "autoFormat": true,
  "colorize": true,
  "showScores": true,
  "saveHistory": true,
  "maxHistory": 100,
  "defaultEngines": null,
  "defaultCategory": null,
  "theme": "default"
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `searxngUrl` | string | "http://localhost:8080" | SearXNG instance URL |
| `defaultLimit` | number | 10 | Default number of results |
| `defaultSearxngParams` | object | `{}` | Default passthrough query params sent to SearXNG |
| `forceLocalAgentRouting` | boolean | `true` | Force `--agent`/`--agent-json`/`--agent-ci` to local SearXNG URL |
| `defaultFormat` | string | "toon" | Default output format |
| `defaultTimeout` | number | 15000 | Request timeout (ms) |
| `autoUnescape` | boolean | true | Auto-unescape HTML entities |
| `autoFormat` | boolean | true | Auto-format output |
| `colorize` | boolean | true | Enable colored output |
| `showScores` | boolean | true | Show relevance scores |
| `saveHistory` | boolean | true | Save search history |
| `maxHistory` | number | 100 | Maximum history entries |
| `defaultEngines` | string | null | Default search engines |
| `defaultCategory` | string | null | Default search category |
| `theme` | string | "default" | Color theme |

### Managing Configuration

```bash
searxng --config show       # Show current config
searxng --config edit       # Edit in $EDITOR
searxng --config reset      # Reset to defaults
```

## Environment Variables

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARXNG_URL` | `http://localhost:8080` | SearXNG instance URL |
| `SEARXNG_TIMEOUT` | `15000` | Request timeout (ms) |
| `SEARXNG_MAX_RETRIES` | `2` | Max retry attempts |
| `SEARXNG_RETRY_DELAY` | `100` | Delay between retries (ms) |

### Output Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NO_COLOR` | - | Disable colored output |
| `DEBUG` | - | Enable debug logging |

### Network Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PROXY` | - | HTTP proxy URL |
| `HTTPS_PROXY` | - | HTTPS proxy URL |
| `NO_COMPRESSION` | - | Disable compression |

## Color Themes

Available themes:

- `default` - Cyan primary, yellow secondary
- `ocean` - Blue primary, cyan secondary
- `forest` - Green primary, bright green secondary
- `sunset` - Magenta primary, yellow secondary
- `mono` - White/grayscale

```bash
searxng --theme ocean "query"
```

## Adaptive Settings

SearXNG CLI automatically adjusts settings based on instance type:

### Local Instance Detection

An instance is considered "local" if the URL:
- Starts with `http://192.168.`
- Starts with `http://localhost`
- Starts with `http://127.`

### Local Instance Defaults

| Setting | Value |
|---------|-------|
| Timeout | 15s |
| Retries | 2 |
| Retry Delay | 100ms |
| Cache Size | Unlimited (`LRU_CACHE_SIZE=0`) |
| Rate Limit | None |
| Circuit Breaker Threshold | 25 |

### Remote Instance Defaults

| Setting | Value |
|---------|-------|
| Timeout | 30s |
| Retries | 3 |
| Retry Delay | 1000ms |
| Cache Size | Unlimited (`LRU_CACHE_SIZE=0`) |
| Rate Limit | 30ms |
| Circuit Breaker Threshold | 5 |

## Presets

Save and reuse search configurations.

### Save Preset

```bash
searxng --save-preset dev-search -e github,stackoverflow -n 20 "test"
```

### Use Preset

```bash
searxng --preset dev-search "nodejs async"
```

### List Presets

```bash
searxng --presets
```

## Data Files

All data is stored in `~/.searxng-cli/`:

| File | Description |
|------|-------------|
| `settings.json` | User settings (from setup wizard) |
| `config.json` | Legacy configuration |
| `cache.json` | Search result cache |
| `history.json` | Search history |
| `bookmarks.json` | Saved bookmarks |
| `presets.json` | Search presets |
| `suggestions.json` | Autocomplete suggestions |
| `engines.json` | Engine discovery cache |
| `.setup-complete` | Marker file for setup completion |

## Priority Order

Configuration is applied in this order (later overrides earlier):

1. Built-in defaults
2. Configuration file (`config.json`)
3. Settings file (`settings.json`) - highest priority for persistent settings
4. Environment variables
5. Command-line options

**Note**: The `settings.json` file (created by `--setup` wizard) takes precedence over `config.json` for settings like `searxngUrl`, `defaultFormat`, `defaultLimit`, and `theme`.

## Examples

### Set Default Engine

```bash
# In config.json
{
  "defaultEngines": "google,duckduckgo"
}
```

### Always Use JSON

```bash
# In config.json
{
  "defaultFormat": "json"
}
```

### Disable History

```bash
# In config.json
{
  "saveHistory": false
}
```

### Custom Timeout

```bash
export SEARXNG_TIMEOUT=30000
searxng "query"
```
