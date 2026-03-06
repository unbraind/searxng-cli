# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

No unreleased changes yet.

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
