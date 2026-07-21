# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## Unreleased

### Added

- Automate change-aware releases with generated project history ([searx-auto-release](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/features/searx-auto-release.toon))
- Added conservative global coverage thresholds so test-coverage regressions fail the quality gate. ([searx-pkax](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-pkax.toon))

### Changed

- Updated Windows browser launching to use the directly spawnable `explorer.exe` executable. ([searx-aacw](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-aacw.toon))
- Updated production and development dependencies, including MCP SDK 1.29, TOON 2.3, Commander 15, node-html-parser 9, Vitest 4, TypeScript 7, Prettier 3.9, and esbuild 0.28.1. ([searx-l2pe](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-l2pe.toon))
- Updated the supported runtime to Node.js 22.12 or newer and modernized GitHub Actions to current Node-compatible major versions. ([searx-4tn8](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-4tn8.toon))

### Fixed

- Validate tag releases without requiring the next version ([searx-tag-release-validation](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-tag-release-validation.toon))
- Keep Auto Release runner output outside the checkout ([searx-auto-release-clean-tree](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-auto-release-clean-tree.toon))
- Made the 60-test E2E suite provision and clean up its own mock SearXNG backend by default while preserving `E2E_SEARXNG_URL` for explicit live-instance runs. ([searx-30a6](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-30a6.toon))
- Updated TOON and MCP tests for their current dependency contracts while preserving runtime behavior. ([searx-drjo](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-drjo.toon))
- Make the E2E suite self-contained by default ([searx-hermetic-e2e](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-hermetic-e2e.toon))

### Security

- Upgraded Gitleaks Action to its Node 24-based v3 runtime. ([searx-0tkk](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-0tkk.toon))
- Pinned every GitHub Action to a full commit SHA and enabled repository enforcement for SHA pins. ([searx-abk2](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-abk2.toon))
- Enabled native GitHub secret scanning and push protection alongside the existing Gitleaks checks. ([searx-seu0](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-seu0.toon))
- Changed trusted-source ranking to use parsed hostname boundaries instead of attacker-controlled URL substring matches. ([searx-0ww2](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-0ww2.toon))
- Hardened remote result-content enrichment with URL, redirect, content-type, response-size, and concurrency boundaries. ([searx-pbki](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-pbki.toon))
- Eliminated all known dependency audit findings, including the critical Vitest and low-severity esbuild advisories reported by GitHub Dependabot. ([searx-kh5v](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-kh5v.toon))
- Execute repository security and modernization recovery ([searx-recovery-plan](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/plans/searx-recovery-plan.toon))
- Audit and harden source, packaging, documentation, and repository security ([searx-repository-audit](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-repository-audit.toon))
- Harden remote content fetching and URL trust scoring ([searx-remote-fetch-hardening](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-remote-fetch-hardening.toon))
- Upgrade dependencies and eliminate resolved-graph vulnerabilities ([searx-dependency-remediation](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-dependency-remediation.toon))

### Other

- Document and verify the complete automated release operating model ([searx-release-validation](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-release-validation.toon))
- Implement guarded auto-release and npm plus Bun delivery verification ([searx-release-publishing](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-release-publishing.toon))
- Migrate every existing changelog statement into pm-changelog source data ([searx-changelog-migration](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-changelog-migration.toon))
- Modernize GitHub Actions and supported CI runtimes ([searx-ci-modernization](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-ci-modernization.toon))
- Deliver consolidated PR and close superseded GitHub maintenance backlog ([searx-github-delivery](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-github-delivery.toon))
- Run comprehensive local and isolated package verification ([searx-verification](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-verification.toon))
- Establish non-regressing coverage policy ([searx-coverage-governance](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-coverage-governance.toon))

## 2026.3.6-3 - 2026-03-06

### Added

- Added dedicated onboarding-state tests to verify prompt persistence across repeated runs. ([searx-changelog-02](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-changelog-02.toon))
- Expanded unit coverage for setup lifecycle behavior and GitHub CLI command execution paths. ([searx-changelog-01](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-changelog-01.toon))

### Changed

- Improved setup-local onboarding parity with first-run/setup flows and refined fallback messaging when GitHub CLI automation is unavailable. ([searx-changelog-04](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-changelog-04.toon))

### Fixed

- Fixed setup/onboarding state persistence so completed prompt decisions are saved and respected on subsequent runs. ([searx-changelog-03](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-changelog-03.toon))

## 2026.3.6-2 - 2026-03-06

### Added

- Added explicit support for `--` end-of-options so dash-prefixed literal query text is handled predictably. ([searx-changelog-06](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-changelog-06.toon))
- Added typo suggestions for unknown command input (for example `instnace` now suggests `instance`). ([searx-changelog-05](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-changelog-05.toon))

### Changed

- Updated CLI help text to document `--` as the explicit “stop option parsing” delimiter. ([searx-changelog-13](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-changelog-13.toon))
- Improved unknown-command UX by showing literal-search guidance (`searxng -- <text>`) and nearest-command suggestion hints when applicable. ([searx-changelog-12](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-changelog-12.toon))

### Fixed

- Fixed value-taking flag parsing to return explicit `Missing value for <flag>` errors when required values are omitted. ([searx-changelog-11](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-changelog-11.toon))
- Fixed `--option=value` parsing to preserve values containing additional `=` characters. ([searx-changelog-10](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-changelog-10.toon))
- Fixed unknown options (for example `--nonexistent-flag`) so they now return explicit errors instead of being treated as query text. ([searx-changelog-09](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-changelog-09.toon))
- Fixed unknown command-like input so it no longer silently falls through to a search query. ([searx-changelog-08](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-changelog-08.toon))
- Added regression test coverage for unknown command handling, unknown option handling, missing flag values, command suggestions, and parsing edge cases. ([searx-changelog-07](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-changelog-07.toon))

## 2026.3.6 - 2026-03-06

### Changed

- Updated CLI help and docs to clarify that `--set-force-local-routing` pins searches to the configured SearXNG URL. ([searx-changelog-16](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-changelog-16.toon))

### Fixed

- Added end-to-end regression tests to verify health and search execution stay on configured non-default URLs when `forceLocalRouting` is enabled. ([searx-changelog-15](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-changelog-15.toon))
- Fixed `forceLocalRouting` to honor configured `searxngUrl` for non-agent searches instead of forcing `http://localhost:8080`. ([searx-changelog-14](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/issues/searx-changelog-14.toon))

## 2026.3.4 - 2026-03-04

### Added

- Full-history secret scanning and version-policy validation scripts. ([searx-changelog-19](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-changelog-19.toon))
- `npx` and `bunx` package smoke tests in CI. ([searx-changelog-18](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-changelog-18.toon))
- Pre-release baseline documentation, automation workflows, and release gates. ([searx-changelog-17](https://github.com/unbraind/searxng-cli/blob/master/.agents/pm/tasks/searx-changelog-17.toon))
