import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  calendarVersion,
  isReleaseRelevantPath,
  nextCalendarVersion,
} from '../../scripts/release/release-state.mjs';
import { hasExactVersionLine } from '../../scripts/release/version-output.mjs';

describe('release automation', () => {
  const date = new Date('2026-07-21T02:00:00Z');

  it('uses unpadded UTC calendar versions', () => {
    expect(calendarVersion(date)).toBe('2026.7.21');
  });

  it('increments same-day ordinals deterministically', () => {
    expect(nextCalendarVersion(['v2026.7.20'], date)).toBe('2026.7.21');
    expect(nextCalendarVersion(['v2026.7.21', 'v2026.7.21-2'], date)).toBe('2026.7.21-3');
  });

  it('ignores tracker-only commits but retains changelog and source changes', () => {
    expect(isReleaseRelevantPath('.agents/pm/tasks/searx-a.toon')).toBe(false);
    expect(isReleaseRelevantPath('CHANGELOG.md')).toBe(true);
    expect(isReleaseRelevantPath('src/index.ts')).toBe(true);
  });

  it('keeps the Auto Release workflow guarded and change-aware', () => {
    const workflow = readFileSync('.github/workflows/auto-release.yml', 'utf8');
    expect(workflow).toContain('cron: "47 2 * * *"');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('RELEASE_PAT is required');
    expect(workflow).toContain('scripts/release/run-release-pipeline.mjs');
    expect(workflow).toContain('$RUNNER_TEMP/release-result.json');
    expect(workflow).not.toContain('tee release-result.json');
    expect(workflow).toContain('gh run watch');
  });

  it('keeps the legacy changelog preamble in pm-generated output', () => {
    const changelog = readFileSync('CHANGELOG.md', 'utf8');
    const generator = readFileSync('scripts/release/generate-changelog.mjs', 'utf8');
    expect(changelog).toContain(
      'All notable changes to this project will be documented in this file.'
    );
    expect(changelog).toContain('https://keepachangelog.com/en/1.0.0/');
    expect(generator).toContain('pm');
    expect(generator).toContain('baseline.preamble');
  });

  it('allows only the documented private SearXNG service through history scanning', () => {
    const scanner = readFileSync('scripts/secret-scan-history.sh', 'utf8');
    expect(scanner).toContain('192\\.168\\.1\\.183:38522');
    expect(scanner).toContain('10\\.0\\.0\\.1');
    expect(scanner).toContain('172\\.31\\.255\\.255');
    expect(scanner).toContain('searxng-private-endpoint-findings-filtered.txt');
  });

  it('runs coverage through Node even when Bun owns script execution', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const coverageScript = readFileSync('scripts/test-coverage.sh', 'utf8');
    expect(pkg.scripts['test:unit']).toBe('bash scripts/test-coverage.sh');
    expect(coverageScript).toContain('node ./node_modules/vitest/vitest.mjs');
    expect(coverageScript).not.toContain('/usr/bin/node');
    expect(coverageScript).toContain('for path_entry in "${path_entries[@]}"');
    expect(coverageScript).toContain('[[ "$path_entry" != /tmp/bun-node-* ]]');
  });

  it('runs release acceptance against the governed local SearXNG service by default', () => {
    const releaseCheck = readFileSync('scripts/release-check.sh', 'utf8');
    const liveE2e = readFileSync('scripts/e2e-searxng.sh', 'utf8');
    expect(releaseCheck).toContain('LIVE_SEARXNG_URL="${SEARXNG_URL:-http://192.168.1.183:38522}"');
    for (const script of [releaseCheck, liveE2e]) {
      expect(script).toContain('INSTALL_DIR="$(mktemp -d)"');
      expect(script).toContain('npm install --global --prefix "$INSTALL_DIR" "$ROOT_DIR"');
      expect(script).toContain('[[ "$(command -v searxng)" == "$INSTALL_DIR/bin/searxng" ]]');
      expect(script).not.toContain('bun link');
    }
  });

  it('publishes once to npm and verifies npm and Bun consumers', () => {
    const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
    const verifier = readFileSync('scripts/release/verify-published-release.mjs', 'utf8');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      bin: Record<string, string>;
    };
    expect(workflow).toContain('"v*.*.*"');
    expect(workflow).toContain('npm publish --access public --provenance');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('Run tag release gates');
    expect(workflow).toContain('bun run version:audit');
    expect(workflow).not.toContain('- run: bun run release:dry-run');
    expect(workflow).toContain('scripts/release/verify-published-release.mjs');
    expect(workflow).not.toContain('$RUNNER_TEMP/published-consumers');
    expect(verifier).toContain('npm registry did not expose');
    expect(verifier).toContain('npx returned an unexpected version');
    expect(verifier).toContain('bunx returned an unexpected version');
    expect(verifier).toContain('mkdtempSync');
    expect(verifier).toContain('"--prefix", npmDirectory');
    expect(verifier).toContain('"--cwd", bunDirectory');
    expect(verifier).toContain('"--no-install"');
    expect(verifier).toContain('assertIsolatedBinary');
    expect(verifier).toContain('hasSourceStatusResource');
    expect(verifier).toContain('Published consumers do not expose the source-status resource');
    expect(verifier).not.toContain('"--package", `searxng-cli@${version}`');
    expect(pkg.bin).toEqual({
      'searxng-cli': 'dist/searxng-cli.js',
      searxng: 'dist/searxng-cli.js',
    });
    expect(workflow).toContain('gh release create');
  });

  it('accepts only complete version lines from published consumers', () => {
    const expected = 'SearXNG CLI v2026.7.22';
    for (const output of [
      expected,
      `runtime diagnostic\n${expected}\nServer: http://127.0.0.1`,
      `runtime diagnostic\r\n${expected}\r\n`,
    ]) {
      expect(hasExactVersionLine(output, expected)).toBe(true);
    }
    for (const output of [
      'SearXNG CLI v2026.7.220',
      'SearXNG CLI v2026.7.2',
      `prefix ${expected}`,
      `${expected} suffix`,
    ]) {
      expect(hasExactVersionLine(output, expected)).toBe(false);
    }
  });
});
