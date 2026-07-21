import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Native ESM release helper intentionally has no declaration output.
import {
  calendarVersion,
  isReleaseRelevantPath,
  nextCalendarVersion,
} from '../../scripts/release/release-state.mjs';

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
    expect(workflow).toContain('gh run watch');
  });

  it('publishes once to npm and verifies npm and Bun consumers', () => {
    const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
    expect(workflow).toContain('"v*.*.*"');
    expect(workflow).toContain('npm publish --access public --provenance');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('release:verify-published');
    expect(workflow).toContain('gh release create');
  });
});
