import { describe, expect, it, vi } from 'vitest';

const { mainMock } = vi.hoisted(() => ({
  mainMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/index', () => ({ main: mainMock }));

import '@/searxng-cli';

describe('executable entry point', () => {
  it('starts the CLI dispatcher', () => {
    expect(mainMock).toHaveBeenCalledOnce();
  });
});
