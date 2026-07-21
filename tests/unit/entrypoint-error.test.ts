import { afterAll, describe, expect, it, vi } from 'vitest';

const { errorSpy, exitSpy, mainMock } = vi.hoisted(() => ({
  errorSpy: vi.spyOn(console, 'error').mockImplementation(() => undefined),
  exitSpy: vi.spyOn(process, 'exit').mockImplementation(() => undefined as never),
  mainMock: vi.fn(() => Promise.reject(new Error('startup failed'))),
}));

vi.mock('@/index', () => ({ main: mainMock }));

import '@/searxng-cli';

describe('executable entry point failures', () => {
  afterAll(() => {
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('reports fatal dispatcher errors and exits unsuccessfully', async () => {
    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('Fatal error: startup failed');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
