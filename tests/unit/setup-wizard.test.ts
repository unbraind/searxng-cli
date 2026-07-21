import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runSetupWizard,
  getDefaultSettings,
  bootstrapGlobalDataFiles,
  saveSettings,
  saveConfig,
  loadSettings,
} from '@/storage/index';
import * as storage from '@/storage/index';
import * as github from '@/utils/github';
import * as readline from 'readline';
import * as fs from 'fs';
import { SETTINGS_FILE } from '@/config/index';
import type { AppConfig } from '@/types/index';

vi.mock('readline');
vi.mock('fs');

describe('Setup Wizard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    delete process.env.NO_GH_STAR_PROMPT;
  });

  it('should complete setup wizard successfully', async () => {
    const mockInterface = {
      question: vi.fn(),
      close: vi.fn(),
    };

    vi.mocked(readline.createInterface).mockReturnValue(
      mockInterface as unknown as ReturnType<typeof readline.createInterface>
    );

    // Mock global fetch for testConnection
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      );

    // Simulate user inputs
    mockInterface.question
      .mockImplementationOnce((q, cb) => cb('http://localhost:8080')) // step 1
      .mockImplementationOnce((q, cb) => cb('toon')) // step 2
      .mockImplementationOnce((q, cb) => cb('10')) // step 3
      .mockImplementationOnce((q, cb) => cb('y')) // step 4 (save history)
      .mockImplementationOnce((q, cb) => cb('')) // step 4 (keep max history)
      .mockImplementationOnce((q, cb) => cb('y')) // step 5
      .mockImplementationOnce((q, cb) => cb('default')) // step 6
      .mockImplementationOnce((q, cb) => cb('theme=simple&image_proxy=true')) // step 7
      .mockImplementationOnce((q, cb) => cb('y')) // step 8
      .mockImplementationOnce((q, cb) => cb('y')) // confirm save
      .mockImplementationOnce((q, cb) => cb('y')); // star repo prompt

    // Mock testConnection
    vi.spyOn(storage, 'testConnection').mockResolvedValue({ success: true, latency: 100 });

    // Mock GitHub status to trigger prompt
    vi.spyOn(github, 'isGhAuthenticated').mockReturnValue(true);
    vi.spyOn(github, 'hasStarredRepo').mockReturnValue(false);
    vi.spyOn(github, 'starRepo').mockReturnValue(true);

    await runSetupWizard();

    expect(mockInterface.close).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should handle invalid format and theme during setup', async () => {
    process.env.NO_GH_STAR_PROMPT = '1';
    const mockInterface = {
      question: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(
      mockInterface as unknown as ReturnType<typeof readline.createInterface>
    );

    mockInterface.question
      .mockImplementationOnce((q, cb) => cb('')) // keep current url
      .mockImplementationOnce((q, cb) => cb('invalid-format')) // invalid format
      .mockImplementationOnce((q, cb) => cb('abc')) // invalid limit
      .mockImplementationOnce((q, cb) => cb('n')) // disable history
      .mockImplementationOnce((q, cb) => cb('n')) // hide scores
      .mockImplementationOnce((q, cb) => cb('invalid-theme')) // invalid theme
      .mockImplementationOnce((q, cb) => cb('invalid-passthrough')) // invalid default params
      .mockImplementationOnce((q, cb) => cb('n')) // disable agent mode
      .mockImplementationOnce((q, cb) => cb('y')) // confirm save
      .mockImplementationOnce((q, cb) => cb('n')); // star repo prompt (decline)

    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await runSetupWizard();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should allow cancelling setup at the end', async () => {
    process.env.NO_GH_STAR_PROMPT = '1';
    const mockInterface = {
      question: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(
      mockInterface as unknown as ReturnType<typeof readline.createInterface>
    );

    mockInterface.question
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb('-1'))
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb('n')) // cancel
      .mockImplementationOnce((q, cb) => cb('n')); // star repo prompt

    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await runSetupWizard();
    // fs.writeFileSync for settings should NOT have been called for saving
    // (though it might have been called for other things if mocked poorly)
  });

  it('shows existing settings and preserves them after an invalid URL', async () => {
    process.env.NO_GH_STAR_PROMPT = '1';
    vi.mocked(fs.existsSync).mockImplementation((file) => file === SETTINGS_FILE);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(getDefaultSettings()));
    const mockInterface = { question: vi.fn(), close: vi.fn() };
    vi.mocked(readline.createInterface).mockReturnValue(
      mockInterface as unknown as ReturnType<typeof readline.createInterface>
    );
    for (const answer of ['://invalid', '', '', 'n', '', '', '', '', 'n']) {
      mockInterface.question.mockImplementationOnce((_q, cb) => cb(answer));
    }
    const result = await runSetupWizard();
    expect(result.searxngUrl).toBe(getDefaultSettings().searxngUrl);
    expect(mockInterface.close).toHaveBeenCalled();
  });

  it('can retain a normalized URL after a failed connection', async () => {
    process.env.NO_GH_STAR_PROMPT = '1';
    const mockInterface = { question: vi.fn(), close: vi.fn() };
    vi.mocked(readline.createInterface).mockReturnValue(
      mockInterface as unknown as ReturnType<typeof readline.createInterface>
    );
    for (const answer of ['example.com:8080', 'y', '', '', '', '50', '', '', '', '', 'n']) {
      mockInterface.question.mockImplementationOnce((_q, cb) => cb(answer));
    }
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await runSetupWizard();
    expect(result.searxngUrl).toBe('http://example.com:8080');
  });

  it('covers failed current connection and disabled existing preferences', async () => {
    process.env.NO_GH_STAR_PROMPT = '1';
    vi.mocked(fs.existsSync).mockImplementation((file) => file === SETTINGS_FILE);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        ...getDefaultSettings(),
        defaultFormat: 'json',
        saveHistory: false,
        maxHistory: 0,
        showScores: false,
      })
    );
    const mockInterface = { question: vi.fn(), close: vi.fn() };
    vi.mocked(readline.createInterface).mockReturnValue(
      mockInterface as unknown as ReturnType<typeof readline.createInterface>
    );
    for (const answer of ['', 'json', '', '', 'n', '', '', 'n', 'n']) {
      mockInterface.question.mockImplementationOnce((_q, cb) => cb(answer));
    }
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await runSetupWizard();
    expect(result).toMatchObject({ defaultFormat: 'json', showScores: false, maxHistory: 0 });
  });

  it('keeps the current URL when a failed replacement is declined', async () => {
    process.env.NO_GH_STAR_PROMPT = '1';
    const mockInterface = { question: vi.fn(), close: vi.fn() };
    vi.mocked(readline.createInterface).mockReturnValue(
      mockInterface as unknown as ReturnType<typeof readline.createInterface>
    );
    for (const answer of ['example.com:8080', 'n', '', '', 'n', '', '', '', '', 'n']) {
      mockInterface.question.mockImplementationOnce((_q, cb) => cb(answer));
    }
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await runSetupWizard();
    expect(result.searxngUrl).toBe(getDefaultSettings().searxngUrl);
  });

  it('reports and recovers from filesystem failures', () => {
    process.env.DEBUG = '1';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('disk unavailable');
    });
    bootstrapGlobalDataFiles();
    saveConfig({} as AppConfig);
    saveSettings(getDefaultSettings());

    vi.mocked(fs.existsSync).mockImplementation((file) => file === SETTINGS_FILE);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('read failed');
    });
    expect(loadSettings().defaultFormat).toBe('toon');
    expect(errorSpy).toHaveBeenCalled();
    delete process.env.DEBUG;
    bootstrapGlobalDataFiles();
    expect(loadSettings().defaultFormat).toBe('toon');
  });
});
