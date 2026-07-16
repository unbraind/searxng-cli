# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Security

- Eliminated all known dependency audit findings, including the critical Vitest and low-severity
  esbuild advisories reported by GitHub Dependabot.
- Hardened remote result-content enrichment with URL, redirect, content-type, response-size, and
  concurrency boundaries.
- Changed trusted-source ranking to use parsed hostname boundaries instead of attacker-controlled
  URL substring matches.
- Enabled native GitHub secret scanning and push protection alongside the existing Gitleaks checks.
- Pinned every GitHub Action to a full commit SHA and enabled repository enforcement for SHA pins.

### Changed

- Updated the supported runtime to Node.js 22.12 or newer and modernized GitHub Actions to current
  Node-compatible major versions.
- Updated production and development dependencies, including MCP SDK 1.29, TOON 2.3, Commander 15,
  node-html-parser 9, Vitest 4, TypeScript 7, Prettier 3.9, and esbuild 0.28.1.
- Updated Windows browser launching to use the directly spawnable `explorer.exe` executable.
- Added conservative global coverage thresholds so test-coverage regressions fail the quality gate.

### Fixed

- Updated TOON and MCP tests for their current dependency contracts while preserving runtime
  behavior.
- Made the 60-test E2E suite provision and clean up its own mock SearXNG backend by default while
  preserving `E2E_SEARXNG_URL` for explicit live-instance runs.

## [2026.3.6-3] - 2026-03-06

### Added

- Expanded unit coverage for setup lifecycle behavior and GitHub CLI command execution paths.
- Added dedicated onboarding-state tests to verify prompt persistence across repeated runs.

### Fixed

- Fixed setup/onboarding state persistence so completed prompt decisions are saved and respected on subsequent runs.

### Changed

- Improved setup-local onboarding parity with first-run/setup flows and refined fallback messaging when GitHub CLI automation is unavailable.

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
