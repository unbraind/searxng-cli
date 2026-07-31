import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  main,
  resetCacheLoaded,
  showCommandHelp,
  normalizeCommandArgs,
  parseMultiQueries,
  normalizeValidationFormat,
  readValidationPayload,
  toPlainParams,
  getExplicitPresetOverrideKeys,
  applyPresetToOptions,
  runAutocomplete,
  runInstanceOperations,
  savePresetFromOptions,
  enforceLocalRouting,
  ensureCacheLoaded,
  handleGracefulExit,
  handleInterrupt,
  handleTermination,
  handleUnhandledRejection,
  resetShutdownState,
  runDoctor,
  runFormatVerification,
  splitCsvRow,
  assertSelfTest,
  formatAndOutput,
  performSearch,
  formatCacheMaxAge,
  describePayloadSource,
} from '@/index';
import * as storage from '@/storage/index';
import * as cli from '@/cli/index';
import * as cache from '@/cache/index';
import * as http from '@/http/index';
import * as search from '@/search/index';
import * as config from '@/config/index';
import * as mcp from '@/mcp/index';
import * as advancedFormatters from '@/formatters-advanced/index';
import * as validation from '@/formatters/validation';
import type { SearchOptions } from '@/types/index';

vi.mock('@/storage/index');
vi.mock('@/cli/index');
vi.mock('@/cache/index');
vi.mock('@/http/index');
vi.mock('@/search/index');
vi.mock('@/mcp/index');

describe('Main function', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

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
      searxngUrl: 'http://192.168.1.183:38522',
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
      defaultSearxngParams: {},
      forceLocalRouting: true,
      forceLocalAgentRouting: true,
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
    } as SearchOptions);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.argv = ['node', 'index.js'];
  });

  it('should show help if no args provided', async () => {
    process.argv = ['node', 'index.js'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(cache.loadCacheSync).toHaveBeenCalledOnce();
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
      defaultSearxngParams: {},
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
      } as SearchOptions);
      vi.mocked(search.expandQuery).mockReturnValue({
        query: 'query',
        engines: null,
        category: null,
      });
      vi.mocked(http.fetchWithRetry).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      } as Response);

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
      } as SearchOptions);
      vi.mocked(search.expandQuery).mockReturnValue({
        query: 'query',
        engines: null,
        category: null,
      });
      vi.mocked(http.fetchWithRetry).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      } as Response);

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
    expect(storage.updateSetting).toHaveBeenCalledWith('url', 'http://192.168.1.183:38522');
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
    process.argv = ['node', 'index.js', '--config'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.manageConfig).toHaveBeenLastCalledWith('show');
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
    });
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
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('reports an unhealthy instance when the health request fails', async () => {
    const previousSearxngUrl = process.env.SEARXNG_URL;
    process.env.SEARXNG_URL = 'https://search.example.com';
    vi.mocked(storage.loadSettings).mockReturnValue({
      ...storage.loadSettings(),
      searxngUrl: 'https://search.example.com',
    });
    process.argv = ['node', 'index.js', '--health-check'];
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Remote');
    if (previousSearxngUrl === undefined) delete process.env.SEARXNG_URL;
    else process.env.SEARXNG_URL = previousSearxngUrl;
    config.setSearxngUrl('http://localhost:8080');
  });

  it('should run internal test suite', async () => {
    process.argv = ['node', 'index.js', '--test'];
    const responseBody = {
      query: 'test',
      results: [{ title: 'Result', url: 'https://example.com', content: 'Content' }],
      suggestions: [],
      answers: [],
      corrections: [],
    };
    vi.mocked(http.rateLimitedFetch).mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.mocked(http.fetchWithRetry).mockImplementation(async () =>
      Promise.resolve(
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    vi.mocked(cache.getCachedResult).mockReturnValue({ ...responseBody, _cached: true });
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
    });
    vi.mocked(search.deduplicateResults).mockImplementation((results) =>
      results.filter(
        (result, index) => results.findIndex((item) => item.url === result.url) === index
      )
    );
    vi.mocked(search.expandQuery).mockReturnValue({
      query: 'nodejs repo',
      engines: 'github',
      category: null,
    });
    vi.mocked(search.buildUrl).mockImplementation((options) => {
      const url = new URL('http://localhost:8080/search');
      url.searchParams.set('q', options.query);
      if (options.engines) url.searchParams.set('engines', options.engines);
      return url;
    });

    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('reports failures from every internal self-test group', async () => {
    process.argv = ['node', 'index.js', '--test'];
    vi.mocked(http.rateLimitedFetch).mockResolvedValue({ ok: false, status: 503 } as Response);
    vi.mocked(storage.discoverInstance).mockRejectedValue(new Error('discovery failed'));
    vi.mocked(http.fetchWithRetry).mockImplementation(async () =>
      Promise.resolve(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      )
    );
    vi.mocked(cache.getCachedResult).mockReturnValue(null);
    vi.mocked(cache.getCacheStats).mockReturnValue({
      entries: Number.NaN,
      maxSize: 'unlimited',
      utilization: 'n/a',
      persistent: false,
      compressed: true,
      maxAge: 'Endless',
      file: '/tmp/cache.json',
      fileExists: false,
      fileSize: '0 B',
      oldestEntry: null,
      newestEntry: null,
    });
    vi.mocked(search.deduplicateResults).mockReturnValue([]);
    vi.mocked(search.expandQuery).mockReturnValue({ query: 'bad', engines: null, category: null });
    vi.mocked(search.buildUrl).mockReturnValue(new URL('http://localhost:8080/search'));
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('runs MCP mode through the dedicated server adapter', async () => {
    vi.mocked(mcp.runMcpServer).mockResolvedValue(undefined);
    process.argv = ['node', 'index.js', '--mcp'];
    await main();
    expect(mcp.runMcpServer).toHaveBeenCalledOnce();
  });

  it('should run doctor command', async () => {
    process.argv = ['node', 'index.js', '--doctor'];
    vi.mocked(http.rateLimitedFetch).mockRejectedValue(new Error('offline'));
    vi.mocked(http.fetchWithRetry).mockRejectedValue(new Error('offline'));
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should run doctor command in json mode', async () => {
    process.argv = ['node', 'index.js', '--doctor-json'];
    vi.mocked(http.rateLimitedFetch).mockRejectedValue(new Error('offline'));
    vi.mocked(http.fetchWithRetry).mockRejectedValue(new Error('offline'));
    await expect(main()).rejects.toThrow('process.exit');
    const output = logSpy.mock.calls.map((call: unknown[]) => String(call[0] ?? '')).join('\n');
    expect(output).toContain('"checks"');
    expect(output).toContain('"success"');
    expect(output).toContain('"ok"');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('runs successful doctor and formatter verification paths', async () => {
    const responseBody = {
      query: 'probe',
      results: [
        {
          title: 'Result',
          url: 'https://example.com',
          content: 'Content',
          engine: 'local',
          score: 1,
        },
      ],
      suggestions: [],
      answers: [],
      corrections: [],
    };
    vi.mocked(http.rateLimitedFetch).mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.mocked(http.fetchWithRetry).mockImplementation(async () =>
      Promise.resolve(
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    vi.mocked(storage.discoverInstance).mockResolvedValue(undefined);

    await expect(runDoctor(false)).resolves.toBe(0);
    await expect(runDoctor(true)).resolves.toBe(0);
    await expect(runFormatVerification('', false)).resolves.toBe(0);
    await expect(runFormatVerification('custom probe', true)).resolves.toBe(0);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Formatter Verification');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('"format": "format-verification"');
  });

  it('records discovery and formatter exceptions in diagnostics', async () => {
    vi.mocked(http.rateLimitedFetch).mockResolvedValue({ ok: false, status: 503 } as Response);
    vi.mocked(storage.discoverInstance).mockRejectedValue(new Error('discovery failed'));
    vi.mocked(http.fetchWithRetry).mockImplementation(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            query: 'probe',
            results: [{ title: 'Result', url: 'https://example.com' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );
    const formatterSpy = vi
      .spyOn(advancedFormatters, 'formatToonOutput')
      .mockImplementationOnce(() => {
        throw new Error('formatter failed');
      })
      .mockImplementationOnce(() => {
        throw new Error('formatter failed');
      });
    await expect(runDoctor(true)).resolves.toBe(1);
    await expect(runFormatVerification('probe', false)).resolves.toBe(1);
    formatterSpy.mockRestore();

    const validationSpy = vi.spyOn(validation, 'validateFormattedOutput').mockReturnValue({
      valid: false,
      message: 'invalid by test',
    });
    await expect(runFormatVerification('probe', false)).resolves.toBe(1);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('formats valid');
    validationSpy.mockRestore();
  });

  it('covers diagnostic path fallbacks and missing result collections', async () => {
    const previousConfigDir = process.env.SEARXNG_CLI_CONFIG_DIR;
    const previousSearxngUrl = process.env.SEARXNG_URL;
    delete process.env.SEARXNG_CLI_CONFIG_DIR;
    process.env.SEARXNG_URL = 'https://remote.example';
    vi.mocked(storage.loadSettings).mockReturnValue({
      ...storage.loadSettings(),
      searxngUrl: 'https://remote.example',
      forceLocalRouting: false,
      forceLocalAgentRouting: false,
    });
    vi.mocked(http.rateLimitedFetch).mockResolvedValue({ ok: false, status: 503 } as Response);
    vi.mocked(storage.discoverInstance).mockResolvedValue(undefined);
    vi.mocked(http.fetchWithRetry).mockImplementation(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ query: 'probe' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    try {
      await expect(runDoctor(true)).resolves.toBe(1);
      await expect(runFormatVerification('probe', false)).resolves.toBe(1);
      await expect(runFormatVerification('probe', true)).resolves.toBe(1);
      vi.mocked(storage.loadSettings).mockReturnValue({
        ...storage.loadSettings(),
        searxngUrl: 'https://different.example',
      });
      await expect(runDoctor(true)).resolves.toBe(1);
    } finally {
      if (previousConfigDir === undefined) delete process.env.SEARXNG_CLI_CONFIG_DIR;
      else process.env.SEARXNG_CLI_CONFIG_DIR = previousConfigDir;
      if (previousSearxngUrl === undefined) delete process.env.SEARXNG_URL;
      else process.env.SEARXNG_URL = previousSearxngUrl;
      config.setSearxngUrl('http://localhost:8080');
    }
  });

  it('should run verify-formats-json command', async () => {
    process.argv = ['node', 'index.js', '--verify-formats-json', 'query'];
    vi.mocked(http.fetchWithRetry).mockRejectedValue(new Error('offline'));
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('reports human formatter verification fetch failures', async () => {
    vi.mocked(http.fetchWithRetry).mockRejectedValue(new Error('offline'));
    await expect(runFormatVerification('query', false)).resolves.toBe(1);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Format verification failed');
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
    } as SearchOptions);
    vi.mocked(storage.loadSuggestions).mockReturnValue({
      recent: ['recent query'],
      popular: ['popular query'],
    });
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.loadSuggestions).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('renders human suggestions for empty and populated stores', async () => {
    for (const suggestions of [
      { recent: [], popular: [] },
      { recent: ['recent query'], popular: ['popular query'] },
    ]) {
      vi.mocked(storage.loadSuggestions).mockReturnValue(suggestions);
      vi.mocked(cli.parseArgs).mockReturnValue({
        query: '',
        interactive: false,
        suggestions: true,
        format: 'toon',
        compact: false,
      } as SearchOptions);
      process.argv = ['node', 'index.js', '--suggestions'];
      await expect(main()).rejects.toThrow('process.exit');
    }
    vi.mocked(storage.loadSuggestions).mockReturnValue({ recent: [], popular: [] });
    vi.mocked(cli.parseArgs).mockReturnValue({
      query: '',
      interactive: false,
      suggestions: true,
      format: 'raw',
      compact: true,
    } as SearchOptions);
    process.argv = ['node', 'index.js', '--suggestions', '--raw'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Local Suggestions');
  });

  it('renders preset catalogs in every output state', async () => {
    const states = [
      { presets: {}, format: 'toon', compact: false },
      {
        presets: {
          alpha: { createdAt: '2026-07-21T00:00:00.000Z' },
          beta: { createdAt: 42 },
        },
        format: 'toon',
        compact: false,
      },
      {
        presets: {
          alpha: { createdAt: '2026-07-21T00:00:00.000Z' },
          beta: { createdAt: null },
        },
        format: 'raw',
        compact: true,
      },
      {
        presets: { alpha: { createdAt: '2026-07-21T00:00:00.000Z' } },
        format: 'json',
        compact: false,
      },
    ];
    for (const state of states) {
      vi.mocked(storage.loadPresets).mockReturnValue(
        state.presets as ReturnType<typeof storage.loadPresets>
      );
      vi.mocked(cli.parseArgs).mockReturnValue({
        query: '',
        interactive: false,
        listPresets: true,
        format: state.format,
        compact: state.compact,
      } as SearchOptions);
      process.argv = ['node', 'index.js', '--presets'];
      await expect(main()).rejects.toThrow('process.exit');
    }
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Saved Presets');
  });

  it('rejects missing presets and reports verbose preset loads', async () => {
    vi.mocked(storage.loadPresets).mockReturnValue({});
    vi.mocked(cli.parseArgs).mockReturnValue({
      query: 'query',
      interactive: false,
      preset: 'missing',
      format: 'toon',
    } as SearchOptions);
    process.argv = ['node', 'index.js', '--preset', 'missing', 'query'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(1);

    vi.mocked(storage.loadPresets).mockReturnValue({
      dev: { engines: 'github', createdAt: '2026-07-21T00:00:00.000Z' },
    });
    vi.mocked(cli.parseArgs).mockReturnValue({
      query: 'query',
      interactive: false,
      preset: 'dev',
      format: 'toon',
      verbose: true,
      silent: false,
      noCache: true,
      retries: 0,
      refreshEngines: false,
    } as SearchOptions);
    vi.mocked(search.expandQuery).mockReturnValue({
      query: 'query',
      engines: null,
      category: null,
    });
    vi.mocked(search.buildUrl).mockReturnValue(new URL('http://localhost:8080/search?q=query'));
    vi.mocked(http.fetchWithRetry).mockResolvedValue(
      new Response(JSON.stringify({ query: 'query', results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    process.argv = ['node', 'index.js', '--preset', 'dev', '--verbose', 'query'];
    await main();
    expect(errorSpy.mock.calls.flat().join('\n')).toContain('Loaded preset');
  });

  it('emits request JSON and rejects a missing request query', async () => {
    vi.mocked(search.buildUrl).mockReturnValue(
      new URL('http://localhost:8080/search?q=query&engines=github')
    );
    vi.mocked(cli.parseArgs).mockReturnValue({
      ...cli.createDefaultOptions(),
      query: 'query',
      requestJson: true,
      requestMethod: 'post',
      format: 'toon',
      agent: true,
      strict: false,
      validateOutput: false,
      dedup: true,
      searxngParams: undefined,
    } as SearchOptions);
    process.argv = ['node', 'index.js', '--request-json', 'query'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('"format": "request"');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('"method": "POST"');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('"url": "http://localhost:8080/search"');
    expect(exitSpy).toHaveBeenLastCalledWith(0);

    vi.mocked(cli.parseArgs).mockReturnValue({
      ...cli.createDefaultOptions(),
      query: 'query',
      requestJson: true,
      format: 'toon',
      agent: false,
      offlineFirst: true,
      strict: false,
      validateOutput: false,
      dedup: true,
      searxngParams: { theme: 'simple' },
    } as SearchOptions);
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(0);

    vi.mocked(cli.parseArgs).mockReturnValue({
      ...cli.createDefaultOptions(),
      query: ' ',
      requestJson: true,
    } as SearchOptions);
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(1);
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
    } as SearchOptions);
    vi.mocked(storage.loadPresets).mockReturnValue({
      dev: {
        createdAt: '2026-03-03T00:00:00.000Z',
        engines: 'github',
      },
    });
    vi.mocked(search.expandQuery).mockReturnValue({
      query: 'query',
      engines: null,
      category: null,
    });
    vi.mocked(http.fetchWithRetry).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    } as Response);

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
    } as SearchOptions);
    await expect(main()).rejects.toThrow('process.exit');
    expect(storage.addPreset).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('saves a preset and continues when a query is present', async () => {
    vi.mocked(cli.parseArgs).mockReturnValue({
      ...cli.createDefaultOptions(),
      query: 'query',
      interactive: false,
      savePreset: 'search-defaults',
      format: 'toon',
      noCache: true,
      retries: 0,
      refreshEngines: false,
    } as SearchOptions);
    vi.mocked(search.expandQuery).mockReturnValue({
      query: 'query',
      engines: null,
      category: null,
    });
    vi.mocked(search.buildUrl).mockReturnValue(new URL('http://localhost:8080/search?q=query'));
    vi.mocked(http.fetchWithRetry).mockResolvedValue(
      new Response(JSON.stringify({ query: 'query', results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    process.argv = ['node', 'index.js', '--save-preset', 'search-defaults', 'query'];
    await main();
    expect(storage.addPreset).toHaveBeenCalled();
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
    } as SearchOptions);
    vi.mocked(http.rateLimitedFetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ['openai api', 'openai cli'],
    } as Response);
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should perform search', async () => {
    process.argv = ['node', 'index.js', 'query'];
    vi.mocked(cli.parseArgs).mockReturnValue({
      query: 'query',
      interactive: false,
      format: 'toon',
    } as SearchOptions);
    vi.mocked(search.expandQuery).mockReturnValue({
      query: 'query',
      engines: null,
      category: null,
    });

    // Mock search-related functions to avoid real network
    vi.mocked(http.fetchWithRetry).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    } as Response);

    await main(); // Should not exit if it finishes search
    expect(logSpy).toHaveBeenCalled();
  });

  it('runs multi-search success and strict-empty result modes', async () => {
    vi.mocked(search.buildUrl).mockImplementation(
      (options) => new URL(`http://localhost:8080/search?q=${encodeURIComponent(options.query)}`)
    );
    vi.mocked(http.fetchWithRetry).mockImplementation(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    vi.mocked(cli.parseArgs).mockReturnValue({
      ...cli.createDefaultOptions(),
      query: '',
      interactive: false,
      multiSearch: 'first;second',
      format: 'toon',
      strict: false,
      silent: false,
      noCache: true,
      retries: 0,
    } as SearchOptions);
    process.argv = ['node', 'index.js', '--multi', 'first;second'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(0);
    expect(storage.addToHistory).toHaveBeenCalledTimes(2);

    vi.mocked(cli.parseArgs).mockReturnValue({
      ...cli.createDefaultOptions(),
      query: '',
      interactive: false,
      multiSearch: 'only',
      format: 'json',
      strict: true,
      silent: false,
      noCache: true,
      retries: 0,
    } as SearchOptions);
    vi.mocked(http.fetchWithRetry).mockImplementation(async () =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(2);
    expect(errorSpy.mock.calls.flat().join('\n')).toContain('Strict mode');

    vi.mocked(cli.parseArgs).mockReturnValue({
      ...cli.createDefaultOptions(),
      query: '',
      interactive: false,
      multiSearch: 'quiet',
      format: 'raw',
      strict: true,
      silent: true,
      noCache: true,
      retries: 0,
    } as SearchOptions);
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(2);
  });

  it('rejects empty and failed multi-search executions', async () => {
    vi.mocked(cli.parseArgs).mockReturnValue({
      ...cli.createDefaultOptions(),
      query: '',
      interactive: false,
      multiSearch: ' ; ',
      format: 'toon',
    } as SearchOptions);
    process.argv = ['node', 'index.js', '--multi', ' ; '];
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(1);

    vi.mocked(cli.parseArgs).mockReturnValue({
      ...cli.createDefaultOptions(),
      query: '',
      interactive: false,
      multiSearch: 'failed',
      format: 'raw',
      strict: false,
      silent: true,
      noCache: true,
      retries: 0,
    } as SearchOptions);
    vi.mocked(search.buildUrl).mockReturnValue(new URL('http://localhost:8080/search?q=failed'));
    vi.mocked(http.fetchWithRetry).mockRejectedValue(new Error('offline'));
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(1);
  });

  it('applies expanded query defaults and strict final search exits', async () => {
    vi.mocked(cli.parseArgs).mockReturnValue({
      ...cli.createDefaultOptions(),
      query: '!gh topic',
      interactive: false,
      format: 'toon',
      engines: null,
      category: null,
      strict: true,
      silent: false,
      noCache: true,
      retries: 0,
      refreshEngines: true,
    } as SearchOptions);
    vi.mocked(search.expandQuery).mockReturnValue({
      query: 'topic',
      engines: 'github',
      category: 'it',
    });
    vi.mocked(search.buildUrl).mockReturnValue(new URL('http://localhost:8080/search?q=topic'));
    vi.mocked(http.fetchWithRetry).mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    process.argv = ['node', 'index.js', '!gh', 'topic'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(2);
    expect(storage.discoverInstance).toHaveBeenCalledWith(true);
    expect(storage.addToHistory).toHaveBeenCalledWith('topic');

    vi.mocked(cli.parseArgs).mockReturnValue({
      ...cli.createDefaultOptions(),
      query: 'original',
      interactive: false,
      format: 'toon',
      engines: 'existing',
      category: 'existing',
      strict: false,
      silent: false,
      noCache: true,
      retries: 0,
      refreshEngines: false,
    } as SearchOptions);
    vi.mocked(search.expandQuery).mockReturnValue({
      query: 'changed',
      engines: null,
      category: null,
    });
    vi.mocked(http.fetchWithRetry).mockResolvedValue(
      new Response(
        JSON.stringify({ query: 'changed', results: [{ title: 'R', url: 'https://e' }] }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    );
    await main();

    vi.mocked(cli.parseArgs).mockReturnValue({
      ...cli.createDefaultOptions(),
      query: 'failed',
      interactive: false,
      format: 'toon',
      strict: false,
      silent: true,
      noCache: true,
      retries: 0,
      refreshEngines: false,
    } as SearchOptions);
    vi.mocked(search.expandQuery).mockReturnValue({
      query: 'failed',
      engines: null,
      category: null,
    });
    vi.mocked(http.fetchWithRetry).mockRejectedValue(new Error('offline'));
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(1);

    vi.mocked(cli.parseArgs).mockReturnValue({
      ...cli.createDefaultOptions(),
      query: 'strict quiet',
      interactive: false,
      format: 'toon',
      strict: true,
      silent: true,
      noCache: true,
      retries: 0,
      refreshEngines: false,
    } as SearchOptions);
    vi.mocked(search.expandQuery).mockReturnValue({
      query: 'strict quiet',
      engines: null,
      category: null,
    });
    vi.mocked(http.fetchWithRetry).mockResolvedValue(
      new Response(JSON.stringify({ query: 'strict quiet' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(2);
  });

  it('should error on no query', async () => {
    process.argv = ['node', 'index.js', '--limit', '10'];
    vi.mocked(cli.parseArgs).mockReturnValue({ query: '', interactive: false } as SearchOptions);
    await expect(main()).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it.each([
    'search',
    's',
    'autocomplete',
    'setup',
    'settings',
    'set',
    'cache',
    'formats',
    'instance',
    'commands',
    'config',
    'doctor',
    'health',
    'history',
    'bookmarks',
    'presets',
    'suggestions',
    'paths',
    'version',
    'test',
    'unknown',
  ])('renders detailed command help for %s', (command) => {
    showCommandHelp(command);
    expect(logSpy.mock.calls.length + vi.mocked(cli.showHelp).mock.calls.length).toBeGreaterThan(0);
  });

  it('normalizes every command and subcommand form', () => {
    const cases: [string[], string[]][] = [
      [[], []],
      [['--json'], ['--json']],
      [['search', 'query'], ['query']],
      [['s', 'query'], ['query']],
      [
        ['autocomplete', 'type', '--limit', '2'],
        ['--autocomplete', 'type', '--limit', '2'],
      ],
      [['setup'], ['--setup']],
      [['setup', 'local'], ['--setup-local']],
      [['setup', '--local'], ['--setup-local']],
      [['settings'], ['--settings']],
      [['settings', 'json'], ['--settings-json']],
      [['settings', '--json'], ['--settings-json']],
      [['paths'], ['--paths-json']],
      [['commands'], ['--commands']],
      [['commands', 'json'], ['--commands-json']],
      [['commands', '--json'], ['--commands-json']],
      [['health'], ['--instance-resource', 'health']],
      [['doctor'], ['--doctor']],
      [['doctor', 'json'], ['--doctor-json']],
      [['doctor', '--json'], ['--doctor-json']],
      [['instance'], ['--instance-resource', 'capabilities']],
      [['instance', 'info'], ['--instance-info']],
      [
        ['instance', 'json'],
        ['--instance-resource', 'capabilities', '--json'],
      ],
      [
        ['instance', '--json'],
        ['--instance-resource', 'capabilities', '--json'],
      ],
      [
        ['instance', 'stats'],
        ['--instance-resource', 'stats'],
      ],
      [
        ['instance', 'stats', '--json'],
        ['--instance-resource', 'stats', '--json'],
      ],
      [
        ['instance', 'stats', '--format=json'],
        ['--instance-resource', 'stats', '--format=json'],
      ],
      [
        ['instance', 'errors'],
        ['--instance-resource', 'errors'],
      ],
      [
        ['instance', 'errors', '--json'],
        ['--instance-resource', 'errors', '--json'],
      ],
      [
        ['instance', 'errors', '-f=json'],
        ['--instance-resource', 'errors', '-f=json'],
      ],
      [
        ['instance', 'source-status', '--json'],
        ['--instance-resource', 'source-status', '--json'],
      ],
      [['suggestions'], ['--suggestions']],
      [['presets'], ['--presets']],
      [['history'], ['--history']],
      [['bookmarks'], ['--bookmarks']],
      [['version'], ['--version']],
      [['test'], ['--test']],
      [['config'], ['--config', 'show']],
      [
        ['config', 'reset'],
        ['--config', 'reset'],
      ],
      [
        ['formats', 'verify', 'query'],
        ['--verify-formats', 'query'],
      ],
      [
        ['formats', 'verify', 'json', 'query'],
        ['--verify-formats-json', 'query'],
      ],
      [
        ['formats', 'verify', '--json', 'query'],
        ['--verify-formats-json', 'query'],
      ],
      [
        ['formats', 'schema'],
        ['--schema', 'all'],
      ],
      [
        ['formats', 'schema', 'json', 'toon'],
        ['--schema-json', 'toon'],
      ],
      [
        ['formats', 'schema', '--json'],
        ['--schema-json', 'all'],
      ],
      [
        ['formats', 'validate', 'json', 'file'],
        ['--validate-payload', 'json', 'file'],
      ],
      [
        ['formats', 'validate', '--json', 'toon', 'file'],
        ['--validate-payload-json', 'toon', 'file'],
      ],
      [['cache'], ['--cache-status']],
      [['cache', 'status'], ['--cache-status']],
      [['cache', 'json'], ['--cache-status-json']],
      [
        ['cache', 'list', '2'],
        ['--cache-list', '2'],
      ],
      [
        ['cache', 'search', 'term'],
        ['--cache-search', 'term'],
      ],
      [
        ['cache', 'inspect', '1'],
        ['--cache-inspect', '1'],
      ],
      [
        ['cache', 'delete', '1'],
        ['--cache-delete', '1'],
      ],
      [['cache', 'clear'], ['--cache-clear']],
      [
        ['cache', 'export', 'x'],
        ['--cache-export', 'x'],
      ],
      [
        ['cache', 'import', 'x'],
        ['--cache-import', 'x'],
      ],
      [
        ['cache', 'prune', '1'],
        ['--cache-prune', '1'],
      ],
      [['cache', 'help'], ['--cache-help']],
    ];
    for (const [input, expected] of cases) expect(normalizeCommandArgs(input)).toEqual(expected);

    const setKeys = [
      'url',
      'limit',
      'format',
      'theme',
      'engines',
      'timeout',
      'history',
      'max-history',
      'force-local-routing',
      'force-local-agent-routing',
      'param',
      'params-json',
      'params-query',
      'unset-param',
    ];
    for (const key of setKeys) {
      expect(normalizeCommandArgs(['set', key, 'value'])[0]).toContain('--');
      expect(normalizeCommandArgs(['set', key])).toHaveLength(2);
    }
    expect(normalizeCommandArgs(['set', 'local-url'])).toEqual(['--set-local-url']);
    expect(normalizeCommandArgs(['set', 'clear-params'])).toEqual(['--clear-params']);
    expect(normalizeCommandArgs(['set', 'unknown'])).toEqual(['set', 'unknown']);
    expect(normalizeCommandArgs(['literal query'])).toEqual(['literal query']);
    expect(normalizeCommandArgs(['ab'])).toEqual(['ab']);
    expect(normalizeCommandArgs(['unrelated'])).toEqual(['unrelated']);
    expect(normalizeCommandArgs(['formats', 'unknown'])).toEqual(['formats', 'unknown']);
    expect(normalizeCommandArgs(['cache', 'unknown'])).toEqual(['cache', 'unknown']);
    expect(() => normalizeCommandArgs(['search', '--help'])).toThrow('process.exit');
    expect(() => normalizeCommandArgs(['instance', 'missing-resource'])).toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(1);
  });

  it('emits command discovery in TOON and JSON', async () => {
    process.argv = ['node', 'index.js', 'commands'];
    await main();
    expect(logSpy.mock.calls.flat().join('\n')).toContain('format: cli-contracts');
    logSpy.mockClear();
    process.argv = ['node', 'index.js', 'commands', '--json'];
    await main();
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
      format: 'cli-contracts',
      defaults: { output: 'toon', cacheLimit: 'unlimited' },
    });
  });

  it('renders nested operation help from command contracts', () => {
    showCommandHelp('instance', 'metrics');
    showCommandHelp('set', 'format');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Selected operation: metrics');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('searxng set format <value>');
  });

  it('routes instance resources through every global output flag form', async () => {
    const outputFile = join(tmpdir(), `searxng-instance-output-${process.pid}.txt`);
    const cases = [
      ['health'],
      ['health', '--json'],
      ['health', '--raw'],
      ['health', '--toon'],
      ['health', '--format', 'json'],
      ['health', '-f', 'raw'],
      ['health', '--format=json'],
      ['health', '-f=toon'],
      ['health', '--output', outputFile, '--raw'],
      ['health', '-o', outputFile, '--json'],
      ['health', `--output=${outputFile}`, '--toon'],
      ['health', `-o=${outputFile}`, '--raw'],
      ['health', '--verbose', '-V', '--silent', '-s', '--no-cache'],
    ];

    for (const args of cases) {
      vi.mocked(http.rateLimitedFetch).mockResolvedValueOnce(
        new Response('OK', { status: 200, headers: { 'content-type': 'text/plain' } })
      );
      process.argv = ['node', 'index.js', ...args];
      await expect(main()).resolves.toBeUndefined();
      expect(process.exitCode).toBe(0);
      process.exitCode = undefined;
    }

    expect(fs.readFileSync(outputFile, 'utf8')).toBe('OK');
    fs.unlinkSync(outputFile);

    vi.mocked(http.rateLimitedFetch).mockResolvedValueOnce(
      new Response('warming', { status: 200 })
    );
    process.argv = ['node', 'index.js', 'health'];
    await expect(main()).resolves.toBeUndefined();
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it('rejects missing or invalid instance resource flags', async () => {
    const cases = [
      ['--instance-resource'],
      ['health', '--format'],
      ['health', '-f'],
      ['health', '--output'],
      ['health', '-o'],
      ['health', '--format', 'yaml'],
      ['health', '--unknown'],
    ];

    for (const args of cases) {
      process.argv = ['node', 'index.js', ...args];
      await expect(main()).rejects.toThrow('process.exit');
      expect(exitSpy).toHaveBeenLastCalledWith(1);
    }
  });

  it('covers helper normalization, preset, and payload behavior', () => {
    expect(parseMultiQueries('one; two;;three||four\nfive')).toEqual([
      'one',
      'two',
      'three',
      'four',
      'five',
    ]);
    expect(['', 'md', 'yml', 'ndjson', 'html', 'json'].map(normalizeValidationFormat)).toEqual([
      null,
      'markdown',
      'yaml',
      'jsonl',
      'html-report',
      'json',
    ]);
    expect(toPlainParams(new URLSearchParams('a=1&b=2'))).toEqual({ a: '1', b: '2' });
    const file = join(tmpdir(), `searxng-payload-${process.pid}.json`);
    fs.writeFileSync(file, '{"ok":true}');
    expect(readValidationPayload(file)).toBe('{"ok":true}');
    fs.unlinkSync(file);
    const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    expect(() => readValidationPayload(null)).toThrow('Provide an input file');
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    expect(readValidationPayload(null, vi.fn().mockReturnValue('stdin payload'))).toBe(
      'stdin payload'
    );
    if (stdinDescriptor) Object.defineProperty(process.stdin, 'isTTY', stdinDescriptor);

    const explicit = getExplicitPresetOverrideKeys([
      '--json',
      '--stream',
      '--agent-ci',
      '--engines=x',
      '--lang=en',
      '--page=2',
      '--safe=1',
      '--time=day',
      '--category=news',
      '--limit=2',
      '--timeout=1',
      '--retries=1',
      '--score',
      '--no-dedup',
      '--sort',
      '--metadata',
      '--analysis',
      '--domain=x',
      '--exclude-domain=y',
      '--min-score=1',
      '--has-image',
      '--date-after=x',
      '--date-before=y',
      '--sx-theme=x',
    ]);
    expect(explicit.has('format')).toBe(true);
    expect(explicit.has('searxngParams')).toBe(true);
    const options = { searxngParams: { current: 'yes' } } as unknown as SearchOptions;
    applyPresetToOptions(
      options,
      { format: 'yaml', limit: 3, searxngParams: { theme: 'simple' }, ignored: true },
      new Set(['format'])
    );
    expect(options).toMatchObject({
      searxngParams: { current: 'yes', theme: 'simple' },
      limit: 3,
    });
    const optionsWithoutParams = {} as SearchOptions;
    applyPresetToOptions(optionsWithoutParams, { searxngParams: { theme: 'simple' } }, new Set());
    expect(optionsWithoutParams.searxngParams).toEqual({ theme: 'simple' });
    applyPresetToOptions(optionsWithoutParams, { searxngParams: null }, new Set());
    applyPresetToOptions(optionsWithoutParams, { searxngParams: [] }, new Set());
    savePresetFromOptions('helper', {
      ...cli.createDefaultOptions(),
      query: 'query',
    });
    expect(storage.addPreset).toHaveBeenCalledWith('helper', expect.any(Object));
    expect(splitCsvRow('one,"two,part","three""quoted"')).toEqual([
      'one',
      'two,part',
      'three"quoted',
    ]);
    expect(() => assertSelfTest(false, 'failed check')).toThrow('failed check');
    expect(() => assertSelfTest(true, 'unused')).not.toThrow();
    expect(formatCacheMaxAge(Infinity)).toBe('infinite (no expiry)');
    expect(formatCacheMaxAge(250)).toBe('250ms');
    expect(describePayloadSource(null)).toBe('stdin');
    expect(describePayloadSource('/tmp/input')).toBe('/tmp/input');
  });

  it('recognizes every explicit preset override spelling', () => {
    const formatGroups = [
      ['--toon', '--csv', '--xml'],
      ['--yaml', '--yml', '--markdown', '--md'],
      ['--table', '--text', '--simple'],
      ['--html', '--html-report', '--raw'],
      ['--jsonl', '--ndjson'],
      ['--agent', '--ai'],
      ['--agent-json'],
      ['--offline-first', '--cache-only'],
      ['--validate', '--validate-output'],
      ['--strict', '--fail-on-empty'],
    ];
    for (const group of formatGroups) {
      for (const flag of group)
        expect(getExplicitPresetOverrideKeys([flag]).size).toBeGreaterThan(0);
    }
    const valueFlags = [
      '-f',
      '-e',
      '-l',
      '-p',
      '-t',
      '-c',
      '-n',
      '-r',
      '--format=toon',
      '--engines=x',
      '--lang=en',
      '--page=2',
      '--safe=1',
      '--time=day',
      '--category=news',
      '--limit=2',
      '--timeout=2',
      '--retries=1',
      '--compact',
      '--analyze',
      '--params-json',
      '--params-json={}',
      '--params-file',
      '--params-file=x',
      '--param',
      '--param=x=y',
      '--sx',
      '--sx-param',
      '--sx=x=y',
      '--sx-param=x=y',
      '--sx-query',
      '--sx-params',
      '--sx-query=a=b',
      '--sx-params=a=b',
      '--sx-theme',
      '--sx-enabled-plugins',
      '--sx-enabled-plugins=x',
      '--sx-disabled-plugins',
      '--sx-disabled-plugins=x',
      '--sx-enabled-engines',
      '--sx-enabled-engines=x',
      '--sx-disabled-engines',
      '--sx-disabled-engines=x',
      '--sx-enabled-categories',
      '--sx-enabled-categories=x',
      '--sx-disabled-categories',
      '--sx-disabled-categories=x',
      '--sx-image-proxy',
      '--sx-image-proxy=true',
    ];
    for (const flag of valueFlags) {
      expect(getExplicitPresetOverrideKeys([flag]).size, flag).toBeGreaterThan(0);
    }
    expect(getExplicitPresetOverrideKeys(['--unrelated']).size).toBe(0);
  });

  it('covers JSONL validation failure plus browser and bookmark actions', async () => {
    const options = {
      ...cli.createDefaultOptions(),
      query: 'query',
      format: 'json' as const,
      jsonl: false,
      validateOutput: false,
      dedup: false,
      open: 1,
      bookmark: '1',
      output: null,
      export: null,
      citation: false,
      quick: false,
      summary: false,
      pretty: false,
    } as SearchOptions;
    await formatAndOutput(
      { query: 'query', results: [{ title: 'Result', url: 'https://example.com' }] },
      options
    );
    expect(cli.openInBrowser).toHaveBeenCalledWith('https://example.com');
    expect(storage.addBookmark).toHaveBeenCalled();

    const validationSpy = vi.spyOn(validation, 'validateFormattedOutput').mockReturnValueOnce({
      valid: false,
      message: 'bad jsonl',
    });
    await expect(
      formatAndOutput(
        { query: 'query', results: [{ title: 'Result', url: 'https://example.com' }] },
        { ...options, jsonl: true, validateOutput: true, open: null, bookmark: null }
      )
    ).rejects.toThrow('Output validation failed for jsonl');
    validationSpy.mockRestore();
  });

  it('covers semantic cache metadata fallbacks through the orchestrator', async () => {
    vi.mocked(search.buildUrl).mockReturnValue(new URL('http://localhost:8080/search?q=query'));
    vi.mocked(cache.getCachedResult).mockReturnValue(null);
    vi.mocked(cache.getSemanticCachedResult).mockReturnValue({ query: 'query', results: [] });
    vi.mocked(http.fetchWithRetry).mockRejectedValue(new Error('background offline'));
    const result = await performSearch({
      ...cli.createDefaultOptions(),
      query: 'query',
      format: 'toon',
      noCache: false,
      verbose: true,
      silent: false,
      retries: 0,
      dedup: false,
      output: null,
      export: null,
      open: null,
      bookmark: null,
      citation: false,
      quick: false,
      summary: false,
      validateOutput: false,
      pretty: false,
    } as SearchOptions);
    expect(result).not.toBeNull();
    expect(errorSpy.mock.calls.flat().join('\n')).toContain('Similarity: 0.00');
  });

  it('covers local routing policies and cache lifecycle handlers', () => {
    config.setSearxngUrl('http://remote.example');
    enforceLocalRouting({ agent: true, verbose: true, silent: false });
    expect(config.getSearxngUrl()).toBe('http://192.168.1.183:38522');

    vi.clearAllMocks();
    vi.mocked(storage.loadSettings).mockReturnValue({
      ...storage.loadSettings(),
      forceLocalAgentRouting: false,
      forceLocalRouting: true,
    });
    config.setSearxngUrl('http://remote.example');
    enforceLocalRouting({ agent: false, verbose: true, silent: false });
    expect(config.getSearxngUrl()).toBe('http://192.168.1.183:38522');

    vi.mocked(storage.loadSettings).mockReturnValue({
      ...storage.loadSettings(),
      searxngUrl: 'not a url',
      forceLocalAgentRouting: true,
      forceLocalRouting: true,
    });
    config.setSearxngUrl('http://remote.example');
    enforceLocalRouting({ agent: true, verbose: false, silent: true });
    expect(config.getSearxngUrl()).toBe(config.DEFAULT_SEARXNG_URL);
    vi.mocked(storage.loadSettings).mockReturnValue({
      ...storage.loadSettings(),
      searxngUrl: 'http://localhost:8080',
      forceLocalAgentRouting: false,
      forceLocalRouting: false,
    });
    config.setSearxngUrl('http://remote.example');
    enforceLocalRouting({ agent: false, verbose: false, silent: true });
    expect(config.getSearxngUrl()).toBe('http://remote.example');

    vi.clearAllMocks();
    vi.mocked(cache.loadCacheSync).mockReturnValue(3);
    const previousDebug = process.env.DEBUG;
    process.env.DEBUG = '1';
    resetCacheLoaded();
    expect(ensureCacheLoaded()).toBe(3);
    if (previousDebug === undefined) delete process.env.DEBUG;
    else process.env.DEBUG = previousDebug;

    resetShutdownState();
    handleGracefulExit();
    handleGracefulExit();
    expect(cache.saveCacheSync).toHaveBeenCalledOnce();

    resetShutdownState();
    expect(() => handleInterrupt()).toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(0);
    expect(() => handleInterrupt()).not.toThrow();
    resetShutdownState();
    expect(() => handleTermination()).toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(0);
    expect(() => handleTermination()).not.toThrow();
    expect(() => handleUnhandledRejection(new Error('boom'))).toThrow('process.exit');
    expect(() => handleUnhandledRejection('string failure')).toThrow('process.exit');
    expect(exitSpy).toHaveBeenLastCalledWith(1);
  });

  it('covers autocomplete response shapes and endpoint failures', async () => {
    vi.mocked(http.rateLimitedFetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ['one', ['two'], { phrase: 'three' }, {}, 4, 'one'],
    } as Response);
    await expect(
      runAutocomplete({
        query: 'query',
        limit: 0,
        format: 'json',
        compact: true,
      } as SearchOptions)
    ).resolves.toBe(0);
    vi.mocked(http.rateLimitedFetch)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockRejectedValueOnce(new Error('offline'));
    await expect(
      runAutocomplete({ query: 'query', limit: 2, format: 'toon' } as SearchOptions)
    ).resolves.toBe(1);
    await expect(runAutocomplete({ query: ' ', format: 'toon' } as SearchOptions)).resolves.toBe(1);

    vi.mocked(http.rateLimitedFetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ['one'],
    } as Response);
    await expect(
      runAutocomplete({ query: 'query', limit: 1, format: 'toon' } as SearchOptions)
    ).resolves.toBe(0);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('format: autocomplete');
    vi.mocked(http.rateLimitedFetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ suggestions: [] }),
    } as Response);
    await expect(
      runAutocomplete({ query: 'query', limit: 1, format: 'text' } as SearchOptions)
    ).resolves.toBe(0);
    vi.mocked(http.rateLimitedFetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ['human suggestion'],
    } as Response);
    await expect(
      runAutocomplete({ query: 'query', limit: 1, format: 'text' } as SearchOptions)
    ).resolves.toBe(0);
  });

  it('renders instance operations as TOON and JSON', async () => {
    vi.mocked(storage.fetchInstanceErrors).mockResolvedValue({ brave: [['timeout', 2]] });
    vi.mocked(storage.fetchInstanceCapabilities).mockResolvedValue({
      instance: {
        name: 'Local',
        version: '1',
        engines_count: 1,
        categories_count: 1,
        contact_url: null,
        donation_url: null,
        privacypolicy_url: null,
        api_version: '1',
      },
      categories: ['general'],
      languages: ['en'],
      plugins: [],
      engines: [],
      defaults: { autocomplete: '', language: 'en', locale: '', theme: 'simple', safeSearch: 0 },
    });

    await runInstanceOperations('stats', false);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('format: instance-stats');
    await runInstanceOperations('errors', true);
    expect(JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]))).toMatchObject({
      format: 'instance-errors',
      engineErrorCount: 1,
    });

    for (const argv of [['--instance-stats-json'], ['--instance-errors']]) {
      process.argv = ['node', 'index.js', ...argv];
      await expect(main()).resolves.toBeUndefined();
      expect(process.exitCode).toBe(0);
      process.exitCode = undefined;
    }
  });

  it('renders human schema catalog and individual schema', async () => {
    process.argv = ['node', 'index.js', '--schema'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Formatter Schema Catalog');
    process.argv = ['node', 'index.js', '--schema', 'json'];
    await expect(main()).rejects.toThrow('process.exit');
  });

  it('validates payload files and rejects malformed validation arguments', async () => {
    const file = join(tmpdir(), `searxng-validation-${process.pid}.json`);
    const invalidFile = join(tmpdir(), `searxng-validation-invalid-${process.pid}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: '1.0',
        format: 'json',
        query: 'validation',
        source: 'http://localhost:8080',
        generatedAt: '2026-07-21T00:00:00.000Z',
        results: [],
        resultCount: 0,
        returnedCount: 0,
      })
    );
    fs.writeFileSync(invalidFile, '{invalid');
    for (const argv of [
      ['--validate-payload', 'json', file],
      ['--validate-payload-json', 'json', '--input', file],
      ['--validate-payload-json', 'json', `--file=${file}`],
      ['--validate-payload', 'json', `--input=${file}`],
    ]) {
      process.argv = ['node', 'index.js', ...argv];
      await expect(main()).rejects.toThrow('process.exit');
    }
    for (const argv of [
      ['--validate-payload', 'json', invalidFile],
      ['--validate-payload-json', 'json', invalidFile],
      ['--validate-payload-json', 'json', '-'],
    ]) {
      process.argv = ['node', 'index.js', ...argv];
      await expect(main()).rejects.toThrow('process.exit');
    }
    for (const argv of [
      ['--validate-payload'],
      ['--validate-payload', 'json', '--file'],
      ['--validate-payload', 'json', '--unknown'],
      ['--validate-payload', 'json', file, file],
      ['--validate-payload-json', 'json', '/missing/file'],
      ['--validate-payload', 'json', '-'],
    ]) {
      process.argv = ['node', 'index.js', ...argv];
      await expect(main()).rejects.toThrow('process.exit');
    }
    fs.unlinkSync(file);
    fs.unlinkSync(invalidFile);
  });

  it('renders complete instance capabilities in human and JSON modes', async () => {
    const engines = Array.from({ length: 21 }, (_, index) => ({
      name: `engine-${index}`,
      shortcut: `e${index}`,
      categories: index === 0 ? [] : ['general'],
      enabled: true,
      language: 'all',
      paging: false,
      safesearch: false,
      timeRangeSupport: false,
      timeout: null,
    }));
    vi.mocked(storage.fetchInstanceCapabilities).mockResolvedValue({
      instance: {
        name: 'Local',
        version: '1',
        engines_count: 21,
        categories_count: 0,
        contact_url: null,
        donation_url: null,
        privacypolicy_url: null,
        api_version: '1',
      },
      categories: [],
      languages: [],
      plugins: [],
      engines,
      defaults: { autocomplete: '', language: '', locale: '', theme: '', safeSearch: 0 },
    });
    process.argv = ['node', 'index.js', '--instance-info'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('and 1 more');
    process.argv = ['node', 'index.js', '--instance-info-json'];
    await expect(main()).resolves.toBeUndefined();
    expect(process.exitCode).toBe(0);
    expect(() => JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]))).not.toThrow();
    process.exitCode = undefined;
  });

  it('routes every setting command including engine clearing', async () => {
    const cases: [string[], string, string][] = [
      [['--set-theme', 'ocean'], 'theme', 'ocean'],
      [['--set-engines'], 'engines', ''],
      [['--set-engines', 'clear'], 'engines', ''],
      [['--set-engines', 'null'], 'engines', ''],
      [['--set-engines', 'github'], 'engines', 'github'],
      [['--set-timeout', '5000'], 'timeout', '5000'],
      [['--set-history', 'off'], 'history', 'off'],
      [['--set-force-local-routing', 'on'], 'forceLocalRouting', 'on'],
      [['--set-force-local-agent-routing', 'on'], 'forceLocalAgentRouting', 'on'],
      [['--set-max-history', '5'], 'maxHistory', '5'],
      [['--set-params-json', '{}'], 'setParamsJson', '{}'],
      [['--set-params-query', 'a=b'], 'setParamsQuery', 'a=b'],
    ];
    for (const [args, key, value] of cases) {
      process.argv = ['node', 'index.js', ...args];
      await expect(main()).rejects.toThrow('process.exit');
      expect(storage.updateSetting).toHaveBeenLastCalledWith(key, value);
    }
  });

  it('covers cache defaults, misses, and operation failures', async () => {
    process.argv = ['node', 'index.js', '--cache-help'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(cache.showCacheHelp).toHaveBeenCalled();
    process.argv = ['node', 'index.js', '--cache-list', 'invalid'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(cache.showCacheList).toHaveBeenLastCalledWith(50, 0);
    process.argv = ['node', 'index.js', '--cache-list'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(cache.showCacheList).toHaveBeenLastCalledWith(50, 0);
    vi.mocked(cache.deleteCacheEntry).mockReturnValue(false);
    process.argv = ['node', 'index.js', '--cache-delete', '1'];
    await expect(main()).rejects.toThrow('process.exit');
    vi.mocked(cache.exportCache).mockReturnValue({ success: false, error: 'failed' });
    process.argv = ['node', 'index.js', '--cache-export', 'x'];
    await expect(main()).rejects.toThrow('process.exit');
    vi.mocked(cache.importCache).mockReturnValue({ success: false, error: 'failed' });
    process.argv = ['node', 'index.js', '--cache-import', 'x'];
    await expect(main()).rejects.toThrow('process.exit');
    process.argv = ['node', 'index.js', '--cache-delete', 'bad'];
    await expect(main()).rejects.toThrow('process.exit');
    process.argv = ['node', 'index.js', '--cache-inspect'];
    await expect(main()).rejects.toThrow('process.exit');
    process.argv = ['node', 'index.js', '--cache-delete'];
    await expect(main()).rejects.toThrow('process.exit');
  });

  it('covers setup-local unavailable and skipped readiness states', async () => {
    vi.mocked(storage.applyLocalAgentDefaults).mockReturnValue(storage.loadSettings());
    vi.mocked(http.checkConnectionHealth).mockRejectedValue(new Error('unavailable'));
    vi.mocked(storage.discoverInstance).mockRejectedValue(new Error('discovery failed'));
    process.argv = ['node', 'index.js', '--setup-local'];
    await expect(main()).rejects.toThrow('process.exit');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('unavailable');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('skipped');
  });

  it('covers setup-local ready and failed health states', async () => {
    vi.mocked(storage.applyLocalAgentDefaults).mockReturnValue(storage.loadSettings());
    vi.mocked(storage.discoverInstance).mockResolvedValue(undefined);
    for (const ready of [true, false]) {
      vi.mocked(http.checkConnectionHealth).mockResolvedValue(ready);
      process.argv = ['node', 'index.js', '--setup-local'];
      await expect(main()).rejects.toThrow('process.exit');
    }
    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('ready');
    expect(output).toContain('failed');
    expect(output).toContain('primed');
  });
});
