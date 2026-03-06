# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

No unreleased changes yet.

## [2026.3.6-2] - 2026-03-06

### Added

- Added typo suggestions for unknown command input (for example `instnace` now suggests `instance`).
- Added explicit support for `--` end-of-options so dash-prefixed literal query text is handled predictably.
- Added regression test coverage for unknown command handling, unknown option handling, missing flag values, command suggestions, and parsing edge cases.

### Fixed

- Fixed unknown command-like input so it no longer silently falls through to a search query.
- Fixed unknown options (for example `--nonexistent-flag`) so they now return explicit errors instead of being treated as query text.
- Fixed `--option=value` parsing to preserve values containing additional `=` characters.
- Fixed value-taking flag parsing to return explicit `Missing value for <flag>` errors when required values are omitted.

### Changed

- Improved unknown-command UX by showing literal-search guidance (`searxng -- <text>`) and nearest-command suggestion hints when applicable.
- Updated CLI help text to document `--` as the explicit “stop option parsing” delimiter.

## [2026.3.6] - 2026-03-06

### Fixed

- Fixed `forceLocalRouting` to honor configured `searxngUrl` for non-agent searches instead of forcing `http://localhost:8080`.
- Added end-to-end regression tests to verify health and search execution stay on configured non-default URLs when `forceLocalRouting` is enabled.

### Changed

- Updated CLI help and docs to clarify that `--set-force-local-routing` pins searches to the configured SearXNG URL.

## [2026.3.4-2] - 2026-03-04

### Added

- Pre-release baseline documentation, automation workflows, and release gates.
- `npx` and `bunx` package smoke tests in CI.
- Full-history secret scanning and version-policy validation scripts.
