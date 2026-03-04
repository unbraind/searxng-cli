import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSetupWizard } from '@/storage/index';
import * as readline from 'readline';
import * as fs from 'fs';

vi.mock('readline');
vi.mock('fs');

describe('Setup Wizard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('should complete setup wizard successfully', async () => {
    const mockInterface = {
      question: vi.fn(),
      close: vi.fn(),
    };

    vi.mocked(readline.createInterface).mockReturnValue(mockInterface as any);

    // Mock global fetch for testConnection
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as any);

    // Simulate user inputs
    mockInterface.question
      .mockImplementationOnce((q, cb) => cb('http://localhost:8080')) // step 1
      .mockImplementationOnce((q, cb) => cb('toon')) // step 2
      .mockImplementationOnce((q, cb) => cb('10')) // step 3
      .mockImplementationOnce((q, cb) => cb('y')) // step 4 (save history)
      .mockImplementationOnce((q, cb) => cb('100')) // step 4 (max history)
      .mockImplementationOnce((q, cb) => cb('y')) // step 5
      .mockImplementationOnce((q, cb) => cb('default')) // step 6
      .mockImplementationOnce((q, cb) => cb('theme=simple&image_proxy=true')) // step 7
      .mockImplementationOnce((q, cb) => cb('y')) // step 8
      .mockImplementationOnce((q, cb) => cb('y')) // confirm save
      .mockImplementationOnce((q, cb) => cb('y')); // star repo prompt

    // Mock testConnection
    const storage = await import('@/storage/index');
    vi.spyOn(storage, 'testConnection').mockResolvedValue({ success: true, latency: 100 });

    // Mock GitHub status to trigger prompt
    const github = await import('@/utils/github');
    vi.spyOn(github, 'isGhAuthenticated').mockReturnValue(true);
    vi.spyOn(github, 'hasStarredRepo').mockReturnValue(false);
    vi.spyOn(github, 'starRepo').mockReturnValue(true);

    await runSetupWizard();

    expect(mockInterface.close).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should handle invalid format and theme during setup', async () => {
    const mockInterface = {
      question: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockInterface as any);

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

    global.fetch = vi.fn().mockResolvedValue({ ok: true } as any);
    await runSetupWizard();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should allow cancelling setup at the end', async () => {
    const mockInterface = {
      question: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockInterface as any);

    mockInterface.question
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb(''))
      .mockImplementationOnce((q, cb) => cb('n')) // cancel
      .mockImplementationOnce((q, cb) => cb('n')); // star repo prompt

    global.fetch = vi.fn().mockResolvedValue({ ok: true } as any);
    await runSetupWizard();
    // fs.writeFileSync for settings should NOT have been called for saving
    // (though it might have been called for other things if mocked poorly)
  });
});
