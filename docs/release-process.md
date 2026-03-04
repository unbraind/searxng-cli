# Release Process

This repository has not shipped a public release yet. This document defines the release baseline.

## Version Policy

- Version format: `YYYY.M.D` or `YYYY.M.D-N`
- `N` is the release number for that exact UTC day
- If there is only one release that day, omit `-N`
- Date segments and `N` are strict SemVer numeric identifiers (no zero padding)
- Version scripts compute the next version from existing release tags for today

Examples:

- `2026.3.4` (first release on 2026-03-04)
- `2026.3.4-2` (second release on 2026-03-04)

Commands:

```bash
bun run version:sync
bun run version:check
bun run version:audit
```

## Pre-Release Validation

Run this before tagging or publishing:

```bash
bun run release:dry-run
```

It runs:

- `bun run version:check`
- `bun run lint`
- `bun run secrets:history`
- `bun run build`
- `bun run test:unit`
- `bun run smoke:package`
- `npm pack --dry-run`

## Package Execution Compatibility

The package must work in both launch paths:

```bash
npx searxng --version
npx searxng-cli --version
bunx searxng --version
bunx searxng-cli --version
```

## CI/CD Overview

- `ci.yml`: Bun and Node quality/test/package smoke validation on push and PR
- `secret-scan.yml`: full-history gitleaks scan with SARIF upload
- `codeql.yml`: static code scanning
- `release.yml`: manual workflow for final validation, optional npm publish, optional draft GitHub release

## Publish Controls

Publishing is explicit and manual:

- Workflow: GitHub Actions `release`
- Required secret: `NPM_TOKEN`
- npm publish command: `npm publish --access public --provenance`

## First Public Release Checklist

1. Keep `package.json` version on the first UTC-day release (`YYYY.M.D` with no suffix).
2. Make the GitHub repository public.
3. Ensure branch protection requires `ci`, `secret-scan`, and `codeql` checks on `master`.
4. Ensure the GitHub `release` environment exists and includes secret `NPM_TOKEN`.
5. Confirm npm package ownership and npm account publish permissions.
6. Run local preflight:

```bash
bun run release:dry-run
```

7. Trigger GitHub Actions workflow `release` with:
   - `publish_npm = true`
   - `create_github_release = true`

8. Verify:
   - npm package install/exec with `npx` and `bunx`
   - generated draft GitHub release notes
   - release tag matches package version (`vYYYY.M.D` or `vYYYY.M.D-N`)

## History Safety

Before any rewrite operation:

```bash
mkdir -p backup
git bundle create backup/searxng-cli-pre-rewrite-$(date +%Y%m%d-%H%M%S).bundle --all
```

After rewrite:

```bash
bun run secrets:history
bun run release:dry-run
```
