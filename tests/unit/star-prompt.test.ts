import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as readline from 'readline';
import { promptForStar, loadSettings, saveSettings, getDefaultSettings } from '@/storage/index';
import { SETTINGS_FILE } from '@/config/index';
import * as github from '@/utils/github';

vi.mock('readline', () => ({
  createInterface: vi.fn(),
}));

vi.mock('@/utils/github', () => ({
  REPO: 'unbraind/searxng-cli',
  REPO_URL: 'https://github.com/unbraind/searxng-cli',
  isGhAuthenticated: vi.fn(),
  hasStarredRepo: vi.fn(),
  starRepo: vi.fn(),
}));

const setTTY = (stdinTTY: boolean, stdoutTTY: boolean): void => {
  Object.defineProperty(process.stdin, 'isTTY', {
    value: stdinTTY,
    configurable: true,
  });
  Object.defineProperty(process.stdout, 'isTTY', {
    value: stdoutTTY,
    configurable: true,
  });
};

describe('GitHub star prompt flow', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CI;
    delete process.env.NO_GH_STAR_PROMPT;
    setTTY(true, true);
    if (fs.existsSync(SETTINGS_FILE)) {
      fs.unlinkSync(SETTINGS_FILE);
    }
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('should prompt once, star via gh, and cache completion', async () => {
    const mockInterface = {
      question: vi.fn((_: string, cb: (answer: string) => void) => cb('')),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockInterface as any);

    vi.mocked(github.isGhAuthenticated).mockReturnValue(true);
    vi.mocked(github.hasStarredRepo).mockReturnValue(false);
    vi.mocked(github.starRepo).mockReturnValue(true);

    await promptForStar(undefined, 'first-run');

    expect(github.starRepo).toHaveBeenCalledTimes(1);
    expect(mockInterface.question).toHaveBeenCalledTimes(1);

    const settingsAfterFirstPrompt = loadSettings();
    expect(settingsAfterFirstPrompt.githubStarPrompt?.status).toBe('starred');
    expect(settingsAfterFirstPrompt.githubStarPrompt?.source).toBe('first-run');

    await promptForStar(undefined, 'first-run');

    expect(github.starRepo).toHaveBeenCalledTimes(1);
    expect(mockInterface.question).toHaveBeenCalledTimes(1);
  });

  it('should print manual link and cache when gh is missing or unauthenticated', async () => {
    vi.mocked(github.isGhAuthenticated).mockReturnValue(false);

    await promptForStar(undefined, 'setup');

    const output = logSpy.mock.calls.map((call: unknown[]) => String(call[0] ?? '')).join('\n');
    expect(output).toContain('https://github.com/unbraind/searxng-cli');
    expect(output).toContain('Install/authenticate gh CLI');

    const settings = loadSettings();
    expect(settings.githubStarPrompt?.status).toBe('manual-link-shown');
    expect(settings.githubStarPrompt?.source).toBe('setup');

    const callCount = logSpy.mock.calls.length;
    await promptForStar(undefined, 'setup');
    expect(logSpy.mock.calls.length).toBe(callCount);
  });

  it('should cache already-starred state without prompting', async () => {
    vi.mocked(github.isGhAuthenticated).mockReturnValue(true);
    vi.mocked(github.hasStarredRepo).mockReturnValue(true);

    await promptForStar(undefined, 'setup-local');

    expect(readline.createInterface).not.toHaveBeenCalled();
    expect(github.starRepo).not.toHaveBeenCalled();
    expect(loadSettings().githubStarPrompt?.status).toBe('already-starred');
  });

  it('should cache decline choice and never ask again', async () => {
    const mockInterface = {
      question: vi.fn((_: string, cb: (answer: string) => void) => cb('n')),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockInterface as any);

    vi.mocked(github.isGhAuthenticated).mockReturnValue(true);
    vi.mocked(github.hasStarredRepo).mockReturnValue(false);

    await promptForStar(undefined, 'setup');
    expect(loadSettings().githubStarPrompt?.status).toBe('declined');

    await promptForStar(undefined, 'setup');
    expect(mockInterface.question).toHaveBeenCalledTimes(1);
  });

  it('should cache star failure when gh star command fails', async () => {
    const mockInterface = {
      question: vi.fn((_: string, cb: (answer: string) => void) => cb('y')),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockInterface as any);

    vi.mocked(github.isGhAuthenticated).mockReturnValue(true);
    vi.mocked(github.hasStarredRepo).mockReturnValue(false);
    vi.mocked(github.starRepo).mockReturnValue(false);

    await promptForStar(undefined, 'setup');

    expect(loadSettings().githubStarPrompt?.status).toBe('star-failed');
    expect(loadSettings().githubStarPrompt?.source).toBe('setup');
  });

  it('should respect cached state and skip gh checks entirely', async () => {
    saveSettings({
      ...getDefaultSettings(),
      githubStarPrompt: {
        status: 'declined',
        source: 'setup',
        completedAt: '2026-03-06T00:00:00.000Z',
      },
    });

    await promptForStar(undefined, 'first-run');

    expect(github.isGhAuthenticated).not.toHaveBeenCalled();
    expect(github.hasStarredRepo).not.toHaveBeenCalled();
    expect(github.starRepo).not.toHaveBeenCalled();
    expect(readline.createInterface).not.toHaveBeenCalled();
  });

  it('should skip interactive prompt when terminal is non-interactive', async () => {
    setTTY(false, false);
    vi.mocked(github.isGhAuthenticated).mockReturnValue(true);
    vi.mocked(github.hasStarredRepo).mockReturnValue(false);

    await promptForStar(undefined, 'first-run');

    expect(readline.createInterface).not.toHaveBeenCalled();
    expect(loadSettings().githubStarPrompt).toBeNull();
  });
});
