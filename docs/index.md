# SearXNG CLI Documentation

Welcome to the SearXNG CLI documentation. This is a comprehensive TypeScript command-line search client for SearXNG instances, optimized for both human use and AI/LLM agents.

## Overview

SearXNG CLI is a powerful, privacy-focused search client that connects to SearXNG metasearch engines. It features:

### Core Features

- **TOON Format Default**: Token-Oriented Object Notation for LLM-friendly output (~40% fewer tokens than JSON)
- **Persistent Caching**: Unlimited cache with disk persistence and compression
- **Multiple Output Formats**: JSON, CSV, Markdown, YAML, XML, HTML, table, text, and more
- **Output Validation Mode**: `--validate-output` for CI-safe machine format checks
- **Payload Re-Validation**: `--validate-payload` / `--validate-payload-json` for saved artifacts
- **Provenance Metadata**: machine formats include source URL + generation timestamp fields
- **Formatter Verification Commands**: `--verify-formats` and `--verify-formats-json` for release gates
- **Machine Diagnostics**: `--doctor-json` for CI/agent-readable readiness checks
- **Request Envelope Introspection**: `--request-json` exposes resolved URL + params for replay
- **Machine Paths/Cache Introspection**: `--paths-json` and `--cache-status-json`
- **History Secret Scan**: `bun run secrets:history` for release safety checks
- **Global Data Bootstrap**: automatically initializes all managed `~/.searxng-cli/*` files
- **Interactive Setup Wizard**: Easy first-time configuration with connection testing
- **First-Run Auto Setup**: Interactive sessions auto-launch setup when not yet configured
- **Command-First UX**: `searxng [command] [flags]` with per-command `--help`
- **Full TypeScript**: 100% type-safe implementation with comprehensive type exports

### AI/LLM Features

- **Agent Mode**: Optimized output for AI agents with `--agent` flag
- **Structured Metadata**: Query info, timing, cache status, domain distribution
- **Result Analysis**: Engine statistics, sentiment analysis, keyword extraction
- **Compact Encoding**: Minimal token usage for cost-effective API calls

### Search Features

- **Search Aliases**: Quick engine selection with `!gh`, `!so`, `!wiki`, etc.
- **Instance Capability Discovery**: `--instance-info` / `--instance-info-json`
- **Engine Groups**: Pre-configured engine sets (dev, ai, security, docs)
- **Advanced Filtering**: Domain, date, score, and image filters
- **Time Ranges**: day, week, month, year filtering
- **Categories**: general, images, videos, news, music, files, it, science, social

### Performance

- **Circuit Breaker**: Automatic failure detection and recovery
- **Rate Limiting**: Configurable request throttling
- **Connection Pooling**: HTTP Keep-Alive with adaptive timeouts
- **Smart Deduplication**: Removes duplicate results automatically

## Documentation Sections

| Section                                     | Description                               |
| ------------------------------------------- | ----------------------------------------- |
| [Getting Started](./getting-started.md)     | Installation and quick start guide        |
| [Usage](./usage.md)                         | Detailed command-line usage               |
| [Output Formats](./formats.md)              | All supported output formats              |
| [Caching](./caching.md)                     | Cache management and configuration        |
| [Configuration](./configuration.md)         | Configuration options                     |
| [End-to-End Testing](./e2e-testing.md)      | Real `searxng` command verification       |
| [Release Process](./release-process.md)     | Dry-run and manual publishing workflow    |
| [API Reference](./api.md)                   | Programmatic API documentation            |
| [Development](./development.md)             | Contributing and development guide        |
| [Agent Mode](./agent-mode.md)               | AI/LLM integration guide                  |

## Quick Links

- [GitHub Repository](https://github.com/unbraind/searxng-cli)
- [npm Package](https://www.npmjs.com/package/searxng-cli)
- [TOON Format Specification](https://toonformat.dev)
- [SearXNG Project](https://searxng.org)

## Version

Version scheme: `yyyy.m.d` (first release of day) or `yyyy.m.d-N` (release 2+).

## License

MIT License - see [LICENSE](../LICENSE) for details.
