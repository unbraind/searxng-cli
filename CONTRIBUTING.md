# Contributing

## Development Environment

- Bun: `>=1.0.0`
- Node.js: `>=18`

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
bun run smoke:package
```

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

Publishing is manual via GitHub Actions release workflow.
