# Release Process

searxng-cli uses the same change-aware daily release model as pm-cli: a scheduled workflow checks
for release-relevant commits after the latest tag, generates the changelog from closed `pm` items,
runs the full release gates, and only then creates and pushes a calendar-versioned release commit
and tag. The tag starts the publication workflow.

## Distribution model

The package is published once, to the public npm registry as `searxng-cli`. npm, npx, Bun, and
bunx all consume that same registry artifact; Bun does not have a separate package registry to
publish to. A release is complete only after the exact version is visible through `npm view` and
executes successfully through both `npx` and `bunx`.

Publication uses `npm publish --access public --provenance` on a GitHub-hosted runner with
`id-token: write`. This follows GitHub's documented npm provenance workflow:
<https://docs.github.com/en/actions/tutorials/publish-packages/publish-nodejs-packages>.

## Version policy

- First release on a UTC day: `YYYY.M.D`
- Additional explicitly prepared release on that day: `YYYY.M.D-N`, starting at `-2`
- Scheduled Auto Release cuts at most one release per UTC day.
- Month, day, and ordinal are unpadded SemVer numeric identifiers.

The release pipeline computes the version from UTC and reachable `v*` tags. `package.json`, the
release tag, npm metadata, and GitHub Release must all carry exactly the same version.

## Changelog ownership and preservation

`CHANGELOG.md` is generated data. Its canonical source is the closed item set under `.agents/pm`,
rendered by the latest installed `pm-changelog` package:

```bash
bun run changelog:pm
bun run changelog:pm:check
bun run changelog:preservation:check
```

The migration preserved all 31 statements that existed before generation: 12 pending statements
and 19 historical statements. The preservation gate checks both sides of the contract:

1. every baseline statement exists as a `pm` item title;
2. every baseline statement exists in generated `CHANGELOG.md`;
3. every reachable historical release heading is retained.

The old hand-written file labeled the initial baseline `2026.3.4-2`, although no such tag exists.
Git history shows those entries were Unreleased at the real `v2026.3.4` tag. Generated history uses
the real `2026.3.4` release window; the legacy label is retained in the corresponding `pm` item
notes and `scripts/release/changelog-baseline.json` so that anomaly is not lost.

Do not edit generated changelog text by hand. Add or correct the closed `pm` item, regenerate, and
run both checks. If classification itself is wrong, fix it in the separately maintained
`pm-changelog` package and then reinstall that package here.

## Release eligibility

`scripts/release/run-release-pipeline.mjs` exits successfully without mutation when:

- there are no commits after the latest release tag;
- all changed paths are under `.agents/pm/` (tracker-only closeout must not create a package);
- a release tag already exists for the current UTC day.

Any product, workflow, documentation, package, or generated changelog change is release-relevant.
The pipeline requires a clean worktree, regenerates the changelog for the target version, runs the
preservation gate and `release:dry-run`, then creates `release: <version>` and `v<version>`.

## GitHub workflows

### Auto Release

`.github/workflows/auto-release.yml` runs daily at 02:47 UTC (away from the high-load start of the
hour) and supports manual dispatch.

- Scheduled runs use `push=true` and `dry_run=false`.
- Manual runs default to a non-mutating dry run.
- Production runs fail before release mutation when `RELEASE_PAT` is missing.
- The workflow waits for the tag-triggered Release run and reports its result.
- A failed scheduled run opens or updates `Auto Release blocked: scheduled run failed`.

GitHub intentionally does not trigger another push workflow from a push authenticated with the
repository `GITHUB_TOKEN`. Auto Release therefore uses a narrowly scoped maintainer `RELEASE_PAT`
for the atomic protected `master` plus tag push. See GitHub's workflow-trigger documentation:
<https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow>.

### Release

`.github/workflows/release.yml` runs for `v*.*.*` tag pushes and can be manually recovered for an
existing tag. It:

1. checks out full tag history and verifies tag/package version equality;
2. installs with the frozen Bun lockfile;
3. runs dependency audit, tag audit, lint, secret-history scan, build, unit tests, package smoke,
   generated changelog check, preservation check, and pack inspection; the pre-tag
   `version:check` is intentionally replaced by the exact tag/package equality check above;
4. skips `npm publish` only when that exact version is already present (safe recovery);
5. publishes to npm with provenance;
6. waits up to five minutes for the exact version to become registry-visible, then verifies it with
   npm, npx, and bunx from an isolated temporary directory so the source checkout cannot satisfy or
   shadow registry resolution;
7. creates or repairs the matching GitHub Release.

## Required release environment

Create a GitHub Environment named `release` with:

- `NPM_TOKEN`: npm automation/granular token allowed to publish `searxng-cli`;
- `RELEASE_PAT`: maintainer token allowed to push to protected `master` and create tags.

Keep the workflow permissions minimal. The npm job receives `id-token: write` only for provenance,
and the PAT is passed only to the atomic git push operation. Do not persist it through checkout or
dependency installation.

## Local operation

Refresh tag truth before diagnostics:

```bash
git fetch --tags --force
```

Validate generated history:

```bash
bun run changelog:pm
bun run changelog:pm:check
bun run changelog:preservation:check
```

Run the complete non-mutating release path from a clean worktree:

```bash
bun run release:pipeline:dry-run
```

The existing lower-level validation remains available:

```bash
bun run version:check
bun run version:audit
bun run release:dry-run
bun run test:release
```

## Pull request review closeout

After every pushed revision, request the configured AI reviews and wait for the exact-head checks
to finish. Then capture a complete, machine-readable inventory:

```bash
bun run reviews:inventory -- --pr 123 > /tmp/searxng-pr-123-reviews.json
jq '.headRefOid, .counts, .reviewThreads[] | select(.isResolved == false)' \
  /tmp/searxng-pr-123-reviews.json
```

The inventory includes conversation comments, submitted reviews, paginated inline review threads,
edited timestamps, reaction totals, resolution state, and check results. Compare `headRefOid` with
the pushed commit before closeout. Read every entry, react to every bot contribution, and reply in
the original inline thread with the fix, evidence, or explicit rationale. Re-run the inventory after
those acknowledgements and immediately before merge so newly added or edited feedback cannot be
missed. The script is intentionally read-only: reactions, replies, and resolutions remain explicit
review decisions rather than unattended bulk mutations.

## Manual dispatch and recovery

Dry-run Auto Release:

```bash
gh workflow run auto-release.yml --ref master -f push=false -f dry_run=true
```

After a tag exists, recover publication or GitHub Release creation without moving the tag:

```bash
gh workflow run release.yml --ref master -f tag=vYYYY.M.D
```

The recovery run detects an already published exact npm version, skips duplicate publication, and
still repeats npm/npx/bunx verification plus GitHub Release repair.

## Post-release proof

```bash
npm view searxng-cli@YYYY.M.D version dist.integrity dist.unpackedSize --json
npx --yes --package searxng-cli@YYYY.M.D -- searxng --version
bunx --bun searxng-cli@YYYY.M.D --version
gh release view vYYYY.M.D --json tagName,name,isDraft,isPrerelease,url
bun run release:verify-published -- --version YYYY.M.D
```

Do not call a release complete from a green publish step alone. Registry metadata and both consumer
execution paths must agree with the tag.
