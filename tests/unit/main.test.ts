import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { main, resetCacheLoaded } from '@/index';
import * as storage from '@/storage/index';
import * as cli from '@/cli/index';
import * as cache from '@/cache/index';
import * as http from '@/http/index';

vi.mock('@/storage/index');
vi.mock('@/cli/index');
vi.mock('@/cache/index');
vi.mock('@/http/index');
vi.mock('@/search/index');
vi.mock('@/formatters/index');
vi.mock('@/formatters-advanced/index');
vi.mock('@/utils/index', () => ({
  colorize: (s: string) => s,
  formatDuration: (n: number) => `${n}ms`,
  safeJsonStringify: (value: unknown, space = 2) => JSON.stringify(value, null, space),
}));

describe('Main function', () => {
  let exitSpy: any;
  let logSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    vi.resetAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resetCacheLoaded();

    // Default mocks
    vi.mocked(storage.loadSettings).mockReturnValue({
      searxngUrl: 'http://localhost:8080',
      defaultLimit: 10,
      defaultFormat: 'toon',
      defaultTimeout: 10000,
      autoUnescape: true,
      autoFormat: true,
      colorize: true,
      showScores: false,
      saveHistory: true,
      maxHistory: 100,
      defaultEngines: null,
      defaultCategory: null,
      theme: 'default',
      lastSetupVersion: '1.0.0',
      setupCompletedAt: '',
    });
    vi.mocked(storage.loadConfig).mockReturnValue({
      defaultLimit: 10,
      defaultFormat: 'toon',
      defaultTimeout: 10000,
      autoUnescape: true,
      autoFormat: true,
      colorize: true,
      showScores: false,
      saveHistory: true,
      maxHistory: 100,
      defaultEngines: null,
      defaultCategory: null,
      theme: 'default',
    });
    vi.mocked(storage.isSetupComplete).mockReturnValue(true);
    vi.mocked(cli.createDefaultOptions).mockReturnValue({
      query: '',
      format: 'toon',
      limit: 10,
      retries: 2,
      page: 1,
      safeSearch: 0,
      timeout: 10000,
      noCache: false,
      silent: false,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.argv = ['node', 'index.js'];
  });

  it('should show help if no args provided', async () => {
    process.argv = ['node', 'index.js'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(cli.showHelp).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should show version', async () => {
    process.argv = ['node', 'index.js', '--version'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(cli.showVersion).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should fail on unknown command-like tokens', async () => {
    process.argv = ['node', 'index.js', 'invalid-command'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(errorSpy).toHaveBeenCalled();
    const output = errorSpy.mock.calls.map((call: unknown[]) => String(call[0] ?? '')).join('\n');
    expect(output).toContain('unknown command "invalid-command"');
    expect(output).toContain('searxng -- invalid-command');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should suggest nearest command for typos', async () => {
    process.argv = ['node', 'index.js', 'instnace'];
    await expect(main()).rejects.toThrow('process.exit');
    const output = errorSpy.mock.calls.map((call: unknown[]) => String(call[0] ?? '')).join('\n');
    expect(output).toContain('unknown command "instnace"');
    expect(output).toContain('Did you mean "instance"?');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should run setup wizard', async () => {
    process.argv = ['node', 'index.js', '--setup'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.runSetupWizard).toHaveBeenCalledWith('setup');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should apply local setup defaults', async () => {
    vi.mocked(storage.applyLocalAgentDefaults).mockReturnValue({
      searxngUrl: 'http://localhost:8080',
      defaultLimit: 10,
      defaultFormat: 'toon',
      defaultTimeout: 10000,
      autoUnescape: true,
      autoFormat: true,
      colorize: true,
      showScores: false,
      saveHistory: true,
      maxHistory: 100,
      defaultEngines: null,
      defaultCategory: null,
      theme: 'default',
      forceLocalRouting: true,
      forceLocalAgentRouting: true,
      lastSetupVersion: '2026.3.3-71',
      setupCompletedAt: '2026-03-03T00:00:00.000Z',
    });
    process.argv = ['node', 'index.js', '--setup-local'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.applyLocalAgentDefaults).toHaveBeenCalled();
    expect(http.checkConnectionHealth).toHaveBeenCalled();
    expect(storage.discoverInstance).toHaveBeenCalledWith(true);
    expect(storage.promptForStar).toHaveBeenCalledWith(undefined, 'setup-local');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should prompt for star on first CLI run before setup completion', async () => {
    const previousCi = process.env.CI;
    delete process.env.CI;
    try {
      vi.mocked(storage.isSetupComplete).mockReturnValue(false);

      process.argv = ['node', 'index.js', 'query'];
      vi.mocked(cli.parseArgs).mockReturnValue({
        query: 'query',
        interactive: false,
        format: 'toon',
        verbose: false,
        silent: false,
        refreshEngines: false,
      } as any);
      const search = await import('@/search/index');
      vi.mocked(search.expandQuery).mockReturnValue({
        query: 'query',
        engines: null,
        category: null,
      });
      const http = await import('@/http/index');
      vi.mocked(http.fetchWithRetry).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      } as any);

      await main();

      expect(storage.promptForStar).toHaveBeenCalledWith(undefined, 'first-run');
    } finally {
      if (previousCi !== undefined) {
        process.env.CI = previousCi;
      } else {
        delete process.env.CI;
      }
    }
  });

  it('should run setup wizard automatically on first interactive CLI run', async () => {
    const previousCi = process.env.CI;
    delete process.env.CI;
    const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    try {
      vi.mocked(storage.isSetupComplete).mockReturnValue(false);

      process.argv = ['node', 'index.js', 'query'];
      vi.mocked(cli.parseArgs).mockReturnValue({
        query: 'query',
        interactive: false,
        format: 'toon',
        verbose: false,
        silent: false,
        refreshEngines: false,
      } as any);
      const search = await import('@/search/index');
      vi.mocked(search.expandQuery).mockReturnValue({
        query: 'query',
        engines: null,
        category: null,
      });
      const http = await import('@/http/index');
      vi.mocked(http.fetchWithRetry).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      } as any);

      await main();

      expect(storage.runSetupWizard).toHaveBeenCalledWith('first-run');
    } finally {
      if (stdinDescriptor) {
        Object.defineProperty(process.stdin, 'isTTY', stdinDescriptor);
      } else {
        delete (process.stdin as { isTTY?: boolean }).isTTY;
      }
      if (stdoutDescriptor) {
        Object.defineProperty(process.stdout, 'isTTY', stdoutDescriptor);
      } else {
        delete (process.stdout as { isTTY?: boolean }).isTTY;
      }
      if (previousCi !== undefined) {
        process.env.CI = previousCi;
      } else {
        delete process.env.CI;
      }
    }
  });

  it('should show settings', async () => {
    process.argv = ['node', 'index.js', '--settings'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.showSettings).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should support command mode for settings json', async () => {
    process.argv = ['node', 'index.js', 'settings', 'json'];
    await expect(main()).rejects.toThrow('process.exit');
    const output = logSpy.mock.calls.map((call: unknown[]) => String(call[0] ?? '')).join('\n');
    expect(output).toContain('"format": "settings"');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should return machine-readable path metadata', async () => {
    process.argv = ['node', 'index.js', '--paths-json'];
    await expect(main()).rejects.toThrow('process.exit');
    const output = logSpy.mock.calls.map((call: unknown[]) => String(call[0] ?? '')).join('\n');
    expect(output).toContain('"format": "paths"');
    expect(output).toContain('"settings"');
    expect(output).toContain('"cache"');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should update a setting', async () => {
    process.argv = ['node', 'index.js', '--set-url', 'http://newurl.com'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.updateSetting).toHaveBeenCalledWith('url', 'http://newurl.com');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should support command mode for set url', async () => {
    process.argv = ['node', 'index.js', 'set', 'url', 'http://newurl.com'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.updateSetting).toHaveBeenCalledWith('url', 'http://newurl.com');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should set local URL shortcut', async () => {
    process.argv = ['node', 'index.js', '--set-local-url'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.updateSetting).toHaveBeenCalledWith('url', 'http://localhost:8080');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should show bookmarks', async () => {
    process.argv = ['node', 'index.js', '--bookmarks'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.showBookmarks).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should show history', async () => {
    process.argv = ['node', 'index.js', '--history'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.showSearchHistory).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should manage config', async () => {
    process.argv = ['node', 'index.js', '--config', 'reset'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.manageConfig).toHaveBeenCalledWith('reset');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should clear cache', async () => {
    process.argv = ['node', 'index.js', '--cache-clear'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(cache.clearCache).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should support command mode for cache clear', async () => {
    process.argv = ['node', 'index.js', 'cache', 'clear'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(cache.clearCache).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should show cache status', async () => {
    process.argv = ['node', 'index.js', '--cache-status'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(cache.showCacheStatus).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should show cache status as JSON', async () => {
    vi.mocked(cache.getCacheStats).mockReturnValue({
      entries: 1,
      maxSize: 'unlimited',
      utilization: 'n/a',
      persistent: true,
      compressed: true,
      maxAge: 'Endless',
      file: '/tmp/cache.json',
      fileExists: true,
      fileSize: '1 KB',
      oldestEntry: null,
      newestEntry: null,
    } as any);
    process.argv = ['node', 'index.js', '--cache-status-json'];
    await expect(main()).rejects.toThrow('process.exit');
    const output = logSpy.mock.calls.map((call: unknown[]) => String(call[0] ?? '')).join('\n');
    expect(output).toContain('"format": "cache-status"');
    expect(output).toContain('"entries": 1');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should export cache', async () => {
    process.argv = ['node', 'index.js', '--cache-export', 'file.json'];
    vi.mocked(cache.exportCache).mockReturnValue({ success: true, entries: 5, file: 'file.json' });
    await expect(main()).rejects.toThrow('process.exit');
    expect(cache.exportCache).toHaveBeenCalledWith('file.json');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should update other settings', async () => {
    process.argv = ['node', 'index.js', '--set-limit', '20'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.updateSetting).toHaveBeenCalledWith('limit', '20');

    process.argv = ['node', 'index.js', '--set-format', 'json'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.updateSetting).toHaveBeenCalledWith('format', 'json');

    process.argv = ['node', 'index.js', '--set-param', 'theme=simple'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.updateSetting).toHaveBeenCalledWith('setParam', 'theme=simple');

    process.argv = ['node', 'index.js', '--unset-param', 'theme'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.updateSetting).toHaveBeenCalledWith('unsetParam', 'theme');

    process.argv = ['node', 'index.js', '--clear-params'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.updateSetting).toHaveBeenCalledWith('clearParams', '__clear__');
  });

  it('should list cache entries', async () => {
    process.argv = ['node', 'index.js', '--cache-list', '10'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(cache.showCacheList).toHaveBeenCalledWith(10, 0);
  });

  it('should search cache', async () => {
    process.argv = ['node', 'index.js', '--cache-search', 'term'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(cache.showCacheSearch).toHaveBeenCalledWith('term');
  });

  it('should inspect cache entry', async () => {
    process.argv = ['node', 'index.js', '--cache-inspect', '1'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(cache.inspectCacheEntry).toHaveBeenCalledWith(1);
  });

  it('should delete cache entry', async () => {
    process.argv = ['node', 'index.js', '--cache-delete', '1'];
    vi.mocked(cache.deleteCacheEntry).mockReturnValue(true);
    await expect(main()).rejects.toThrow('process.exit');
    expect(cache.deleteCacheEntry).toHaveBeenCalledWith(1);
  });

  it('should import cache', async () => {
    process.argv = ['node', 'index.js', '--cache-import', 'file.json'];
    vi.mocked(cache.importCache).mockReturnValue({ success: true, imported: 5, skipped: 0 });
    await expect(main()).rejects.toThrow('process.exit');
    expect(cache.importCache).toHaveBeenCalledWith('file.json');
  });

  it('should prune cache', async () => {
    process.argv = ['node', 'index.js', '--cache-prune', '7'];
    vi.mocked(cache.pruneCache).mockReturnValue({ pruned: 5, remaining: 10 });
    await expect(main()).rejects.toThrow('process.exit');
    expect(cache.pruneCache).toHaveBeenCalled();
  });

  it('should error on missing value for set-url', async () => {
    process.argv = ['node', 'index.js', '--set-url'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should error on invalid cache entry number', async () => {
    process.argv = ['node', 'index.js', '--cache-inspect', 'abc'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should error on missing cache search term', async () => {
    process.argv = ['node', 'index.js', '--cache-search'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should error on missing export path', async () => {
    process.argv = ['node', 'index.js', '--cache-export'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should error on missing import path', async () => {
    process.argv = ['node', 'index.js', '--cache-import'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should error on missing prune days', async () => {
    process.argv = ['node', 'index.js', '--cache-prune'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should run health check', async () => {
    process.argv = ['node', 'index.js', '--health'];
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as any);
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should run internal test suite', async () => {
    process.argv = ['node', 'index.js', '--test'];
    // Mock many things needed by the internal test suite
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    } as any);

    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalled();
  });

  it('should run doctor command', async () => {
    process.argv = ['node', 'index.js', '--doctor'];
    const http = await import('@/http/index');
    vi.mocked(http.rateLimitedFetch).mockRejectedValue(new Error('offline'));
    vi.mocked(http.fetchWithRetry).mockRejectedValue(new Error('offline'));
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should run doctor command in json mode', async () => {
    process.argv = ['node', 'index.js', '--doctor-json'];
    const http = await import('@/http/index');
    vi.mocked(http.rateLimitedFetch).mockRejectedValue(new Error('offline'));
    vi.mocked(http.fetchWithRetry).mockRejectedValue(new Error('offline'));
    await expect(main()).rejects.toThrow('process.exit');
    const output = logSpy.mock.calls.map((call: unknown[]) => String(call[0] ?? '')).join('\n');
    expect(output).toContain('"checks"');
    expect(output).toContain('"success"');
    expect(output).toContain('"ok"');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should run verify-formats-json command', async () => {
    process.argv = ['node', 'index.js', '--verify-formats-json', 'query'];
    const http = await import('@/http/index');
    vi.mocked(http.fetchWithRetry).mockRejectedValue(new Error('offline'));
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should return formatter schema in json', async () => {
    process.argv = ['node', 'index.js', '--schema-json', 'json'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((call: unknown[]) => String(call[0] ?? '')).join('\n');
    expect(output).toContain('"format": "json"');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should return simple formatter schema in json', async () => {
    process.argv = ['node', 'index.js', '--schema-json', 'simple'];
    await expect(main()).rejects.toThrow('process.exit');
    const output = logSpy.mock.calls.map((call: unknown[]) => String(call[0] ?? '')).join('\n');
    expect(output).toContain('"format": "simple"');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should fail for unknown formatter schema', async () => {
    process.argv = ['node', 'index.js', '--schema-json', 'bad-format'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(errorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should show suggestions command output', async () => {
    process.argv = ['node', 'index.js', '--suggestions'];
    vi.mocked(cli.parseArgs).mockReturnValue({
      query: '',
      interactive: false,
      suggestions: true,
      format: 'json',
      compact: false,
    } as any);
    vi.mocked(storage.loadSuggestions).mockReturnValue({
      recent: ['recent query'],
      popular: ['popular query'],
    });
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.loadSuggestions).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should load preset before running search', async () => {
    process.argv = ['node', 'index.js', '--preset', 'dev', 'query'];
    vi.mocked(cli.parseArgs).mockReturnValue({
      query: 'query',
      interactive: false,
      preset: 'dev',
      format: 'toon',
      verbose: false,
      silent: false,
      refreshEngines: false,
    } as any);
    vi.mocked(storage.loadPresets).mockReturnValue({
      dev: {
        createdAt: '2026-03-03T00:00:00.000Z',
        engines: 'github',
      },
    } as any);
    const search = await import('@/search/index');
    vi.mocked(search.expandQuery).mockReturnValue({
      query: 'query',
      engines: null,
      category: null,
    });
    const http = await import('@/http/index');
    vi.mocked(http.fetchWithRetry).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    } as any);

    await main();
    expect(storage.loadPresets).toHaveBeenCalled();
  });

  it('should save preset and exit when query is empty', async () => {
    process.argv = ['node', 'index.js', '--save-preset', 'agent-defaults'];
    vi.mocked(cli.parseArgs).mockReturnValue({
      query: '',
      interactive: false,
      savePreset: 'agent-defaults',
      format: 'toon',
    } as any);
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.addPreset).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should run autocomplete mode in json', async () => {
    process.argv = ['node', 'index.js', '--autocomplete', 'openai'];
    vi.mocked(cli.parseArgs).mockReturnValue({
      query: 'openai',
      interactive: false,
      autocomplete: true,
      format: 'json',
      compact: false,
      limit: 5,
    } as any);
    const http = await import('@/http/index');
    vi.mocked(http.rateLimitedFetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ['openai api', 'openai cli'],
    } as any);
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should perform search', async () => {
    process.argv = ['node', 'index.js', 'query'];
    vi.mocked(cli.parseArgs).mockReturnValue({
      query: 'query',
      interactive: false,
      format: 'toon',
    } as any);
    const search = await import('@/search/index');
    vi.mocked(search.expandQuery).mockReturnValue({
      query: 'query',
      engines: null,
      category: null,
    });

    // Mock search-related functions to avoid real network
    const http = await import('@/http/index');
    vi.mocked(http.fetchWithRetry).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    } as any);

    await main(); // Should not exit if it finishes search
    expect(logSpy).toHaveBeenCalled();
  });

  it('should error on no query', async () => {
    process.argv = ['node', 'index.js', '--limit', '10'];
    vi.mocked(cli.parseArgs).mockReturnValue({ query: '', interactive: false } as any);
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
