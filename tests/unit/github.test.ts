import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isGhAuthenticated, hasStarredRepo, starRepo } from '@/utils/github';
import { execSync } from 'child_process';

vi.mock('child_process');

describe('GitHub Utilities', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('isGhAuthenticated', () => {
    it('should return true if gh auth status succeeds', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      expect(isGhAuthenticated()).toBe(true);
    });

    it('should return false if gh auth status fails', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error();
      });
      expect(isGhAuthenticated()).toBe(false);
    });
  });

  describe('hasStarredRepo', () => {
    it('should return true if viewerHasStarred is true', () => {
      vi.mocked(execSync).mockReturnValue(JSON.stringify({ viewerHasStarred: true }));
      expect(hasStarredRepo()).toBe(true);
    });

    it('should return false if viewerHasStarred is false', () => {
      vi.mocked(execSync).mockReturnValue(JSON.stringify({ viewerHasStarred: false }));
      expect(hasStarredRepo()).toBe(false);
    });

    it('should return false if command fails', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error();
      });
      expect(hasStarredRepo()).toBe(false);
    });
  });

  describe('starRepo', () => {
    it('should return true if star command succeeds', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      expect(starRepo()).toBe(true);
    });

    it('should return false if star command fails', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error();
      });
      expect(starRepo()).toBe(false);
    });
  });
});
