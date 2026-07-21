# Contributing

## Development Environment

- Bun: `>=1.0.0`
- Node.js: `>=22.12`

```bash
bun install
bun run build
bun run test
```

## Branch and PR Rules

- Open a pull request for all non-trivial changes.
- Keep PRs focused and reviewable.
- Include tests for behavior changes.
- Update documentation when CLI behavior or flags change.

## Commit Message Standard

Use Conventional Commits:

```text
<type>(optional-scope): short imperative summary
```

Examples:

- `feat(cli): add --agent-json output mode`
- `fix(search): preserve canonical parameter precedence`
- `docs: update setup-local guidance`

Allowed types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`, `style`, `revert`.

## Quality Gates

Run before opening a PR:

```bash
bun run lint
bun run secrets:history
bun run build
bun run test:unit
bun run test:coverage
bun run smoke:package
```

Coverage is enforced globally at 70% statements, 58% branches, 82% functions, and 72% lines.
These floors are intentionally below the current baseline and should be ratcheted upward as the
large command and storage modules are decomposed and tested.

## Versioning

Version must follow:

- `YYYY.M.D` for the first release of the UTC day
- `YYYY.M.D-N` for release 2+ on that day (`N` = release number)

Commands:

```bash
bun run version:sync
bun run version:check
bun run version:audit
```

## Release Validation

```bash
bun run release:dry-run
```

`CHANGELOG.md` is generated from closed `pm` items with `pm-changelog`; do not edit it by hand.
Use `bun run changelog:pm:check` and `bun run changelog:preservation:check` before merge. Publishing
is change-aware and automated by the daily Auto Release workflow; see `docs/release-process.md`.
