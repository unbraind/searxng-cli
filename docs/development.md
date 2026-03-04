# Development Guide

This project is built with [Bun](https://bun.sh) - a fast all-in-one JavaScript runtime.

## Project Structure

```
searxng-cli/
├── src/
│   ├── searxng-cli.ts       # CLI entry point
│   ├── index.ts             # Main orchestrator
│   ├── types/index.ts       # TypeScript interfaces
│   ├── config/index.ts      # Configuration
│   ├── utils/index.ts       # Utility functions
│   ├── classes/index.ts     # Core classes
│   ├── cache/index.ts       # Caching system
│   ├── http/index.ts        # HTTP handling
│   ├── storage/index.ts     # File storage
│   ├── search/index.ts      # Search functions
│   ├── formatters/index.ts  # Output formatters
│   ├── formatters-advanced/ # TOON, XML, HTML
│   └── cli/index.ts         # Argument parsing
├── tests/
│   └── unit/                # Unit tests
├── docs/                    # Documentation
├── dist/                    # Compiled output
└── package.json
```

## Setup

```bash
git clone https://github.com/unbraind/searxng-cli.git
cd searxng-cli
bun install
```

## Commands

### Versioning

```bash
bun run version:check      # Enforce yyyy.m.d or yyyy.m.d-N release version
bun run version:audit      # Verify release tags follow the same policy
```

### Build

```bash
bun run build              # Compile TypeScript
bun run build:watch        # Watch mode
```

### Development

```bash
bun run dev "query"        # Run with Bun (fast)
bun run start "query"      # Run compiled CLI
```

### Testing

```bash
bun run test               # Run default unit test suite
bun run test:e2e           # Run Vitest E2E suite (requires configured/live instance)
bun run test:watch         # Watch mode
bun run test:coverage      # Run with coverage
bun run test:e2e:searxng   # Run live end-to-end checks via real `searxng` command
bun run secrets:history    # Scan full git history for leaked secrets/endpoints
bun run release:dry-run    # Full release validation without publishing
```

### Linting

```bash
bun run typecheck          # Type check
bun run format             # Format with Prettier
bun run lint               # Type check + format check
```

## Architecture

### Module Dependencies

```
config → utils → classes → cache/http → storage → search → formatters → cli → index
```

### Data Flow

```
CLI Args → ParseArgs → SearchOptions
    ↓
Check Cache → Cache Hit? → Return Cached
    ↓ No
Build URL → HTTP Request → SearXNG
    ↓
Response → Dedupe/Sort/Rank → Format → Output
    ↓
Cache Result
```

## Coding Standards

### Imports

```typescript
// 1. Node.js built-ins
import * as fs from 'fs';
import { spawn } from 'child_process';

// 2. Local modules
import { SEARXNG_URL } from './config';

// 3. Type imports
import type { SearchOptions } from './types';
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Constants | UPPER_SNAKE_CASE | `SEARXNG_URL` |
| Functions | camelCase | `formatOutput` |
| Classes | PascalCase | `CircuitBreaker` |
| Interfaces | PascalCase | `SearchOptions` |
| Booleans | is/has/should prefix | `isHealthy` |

### File Guidelines

- Max 300 lines per file (preferred: 250)
- 2-space indentation
- Single quotes for strings
- Max line width: 100 characters
- Semicolons required

### Error Handling

```typescript
try {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
} catch (err) {
  if (!options.silent) {
    console.error(colorize(`✗ Error: ${(err as Error).message}`, 'red'));
  }
  return null;
}
```

## Writing Tests

### Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { functionName } from '../src/module';

describe('ModuleName', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something', () => {
    expect(functionName('input')).toBe('expected');
  });
});
```

### Running Specific Tests

```bash
bun vitest run tests/unit/utils.test.ts
bun vitest run -t "truncate"
```

### Test Coverage

```bash
bun run test:coverage
```

## Adding New Features

### 1. Add Types

Update `src/types/index.ts`:

```typescript
export interface NewFeature {
  // ...
}
```

### 2. Implement Feature

Create or update appropriate module.

### 3. Add Tests

Create test file in `tests/unit/`.

### 4. Update Documentation

Add documentation in `docs/`.

### 5. Update CLI

Add CLI options in `src/cli/index.ts`.

## Debugging

### Enable Debug Mode

```bash
DEBUG=1 searxng-cli "query"
```

### Verbose Output

```bash
searxng-cli --verbose "query"
```

### Test Specific Instance

```bash
SEARXNG_URL=http://localhost:8080 searxng-cli --test
```

## Release Process

### 1. Update Version

```bash
bun run version:sync
```

### 2. Run Tests

```bash
bun run typecheck
bun run lint
bun run test
bun run build
bun run smoke:package
bun run release:dry-run
```

### 3. Update Changelog

Update `CHANGELOG.md` with changes.

### 4. Publish

```bash
Use the `release` GitHub Actions workflow with manual inputs.
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run linting and tests
5. Submit a pull request

### Pull Request Guidelines

- Include tests for new features
- Update documentation
- Follow coding standards
- Keep changes focused
