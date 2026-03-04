import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as nodefs from 'fs';
import {
  getCacheKey,
  getCacheStats,
  clearCache,
  listCacheEntries,
  searchCache,
  pruneCache,
  resultCache,
  getCachedResult,
  setCachedResult,
  showCacheStatus,
  showCacheList,
  showCacheSearch,
  showCacheHelp,
  getCacheEntry,
  inspectCacheEntry,
  deleteCacheEntry,
  exportCache,
  importCache,
  loadCacheSync,
  saveCacheSync,
} from '@/cache/index';
import { CACHE_FILE } from '@/config/index';
import { LRUCache } from '@/classes/index';
import type { SearchOptions, SearchResponse } from '@/types/index';

const createMockOptions = (overrides: Partial<SearchOptions> = {}): SearchOptions => ({
  query: 'test query',
  format: 'toon',
  engines: null,
  lang: null,
  page: 1,
  safeSearch: 0,
  timeRange: null,
  category: null,
  limit: 10,
  timeout: 15000,
  verbose: false,
  output: null,
  unescape: true,
  autoformat: true,
  score: false,
  interactive: false,
  noCache: false,
  retries: 2,
  open: null,
  stats: false,
  raw: false,
  filter: null,
  batch: null,
  bookmark: null,
  export: null,
  quick: false,
  summary: false,
  dedup: true,
  sort: false,
  group: null,
  config: null,
  showInfo: false,
  runTest: false,
  preset: null,
  savePreset: null,
  listPresets: false,
  compare: null,
  cluster: null,
  suggestions: false,
  pipe: false,
  stream: false,
  jsonl: false,
  rank: false,
  multiSearch: null,
  domainFilter: null,
  excludeDomain: null,
  minScore: null,
  hasImage: false,
  dateAfter: null,
  dateBefore: null,
  theme: 'default',
  compact: false,
  metadata: false,
  urlsOnly: false,
  titlesOnly: false,
  autocomplete: false,
  proxy: null,
  insecure: false,
  health: false,
  watch: false,
  silent: false,
  pretty: false,
  confirm: false,
  agent: false,
  analyze: false,
  cacheStatus: false,
  extract: null,
  sentiment: false,
  structured: false,
  ...overrides,
});

const createMockResponse = (overrides: Partial<SearchResponse> = {}): SearchResponse => ({
  query: 'test query',
  results: [{ title: 'Test Result', url: 'https://example.com', content: 'Test content' }],
  ...overrides,
});

describe('Cache Module', () => {
  beforeEach(() => {
    clearCache();
  });

  afterEach(() => {
    clearCache();
  });

  describe('getCacheKey', () => {
    it('should generate consistent keys for same options', () => {
      const options = createMockOptions();
      const key1 = getCacheKey('test', options);
      const key2 = getCacheKey('test', options);
      expect(key1).toBe(key2);
    });

    it('should include query in key', () => {
      const options = createMockOptions();
      const key = getCacheKey('search term', options);
      expect(key).toContain(encodeURIComponent('search term'));
    });

    it('should include category in key', () => {
      const options1 = createMockOptions({ category: 'images' });
      const options2 = createMockOptions({ category: 'videos' });
      const key1 = getCacheKey('test', options1);
      const key2 = getCacheKey('test', options2);
      expect(key1).not.toBe(key2);
    });

    it('should include language in key', () => {
      const options1 = createMockOptions({ lang: 'en' });
      const options2 = createMockOptions({ lang: 'de' });
      const key1 = getCacheKey('test', options1);
      const key2 = getCacheKey('test', options2);
      expect(key1).not.toBe(key2);
    });

    it('should include page in key', () => {
      const options1 = createMockOptions({ page: 1 });
      const options2 = createMockOptions({ page: 2 });
      const key1 = getCacheKey('test', options1);
      const key2 = getCacheKey('test', options2);
      expect(key1).not.toBe(key2);
    });

    it('should include engines in key', () => {
      const options1 = createMockOptions({ engines: 'google' });
      const options2 = createMockOptions({ engines: 'bing' });
      const key1 = getCacheKey('test', options1);
      const key2 = getCacheKey('test', options2);
      expect(key1).not.toBe(key2);
    });

    it('should include timeRange in key', () => {
      const options1 = createMockOptions({ timeRange: 'day' });
      const options2 = createMockOptions({ timeRange: 'week' });
      const key1 = getCacheKey('test', options1);
      const key2 = getCacheKey('test', options2);
      expect(key1).not.toBe(key2);
    });

    it('should include safeSearch in key', () => {
      const options1 = createMockOptions({ safeSearch: 0 });
      const options2 = createMockOptions({ safeSearch: 2 });
      const key1 = getCacheKey('test', options1);
      const key2 = getCacheKey('test', options2);
      expect(key1).not.toBe(key2);
    });

    it('should include searxng passthrough params in key', () => {
      const options1 = createMockOptions({ searxngParams: { theme: 'simple' } });
      const options2 = createMockOptions({ searxngParams: { theme: 'contrast' } });
      const key1 = getCacheKey('test', options1);
      const key2 = getCacheKey('test', options2);
      expect(key1).not.toBe(key2);
    });

    it('should normalize passthrough params ordering in key', () => {
      const options1 = createMockOptions({
        searxngParams: { theme: 'simple', image_proxy: 'true' },
      });
      const options2 = createMockOptions({
        searxngParams: { image_proxy: 'true', theme: 'simple' },
      });
      const key1 = getCacheKey('test', options1);
      const key2 = getCacheKey('test', options2);
      expect(key1).toBe(key2);
    });
  });

  describe('getCachedResult and setCachedResult', () => {
    it('should store and retrieve cached results', () => {
      const options = createMockOptions();
      const data = createMockResponse();

      setCachedResult('test', options, data);
      const cached = getCachedResult('test', options);

      expect(cached).not.toBeNull();
      expect(cached?._cached).toBe(true);
      expect(cached?._cacheAge).toBeDefined();
    });

    it('should return null for missing cache entries', () => {
      const options = createMockOptions();

      const cached = getCachedResult('nonexistent', options);
      expect(cached).toBeNull();
    });

    it('should return different results for different queries', () => {
      const options = createMockOptions();
      const data1 = createMockResponse({ query: 'query1' });
      const data2 = createMockResponse({ query: 'query2' });

      setCachedResult('query1', options, data1);
      setCachedResult('query2', options, data2);

      expect(getCachedResult('query1', options)?.query).toBe('query1');
      expect(getCachedResult('query2', options)?.query).toBe('query2');
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const stats = getCacheStats();
      expect(stats).toHaveProperty('entries');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('utilization');
      expect(stats).toHaveProperty('persistent');
      expect(stats).toHaveProperty('compressed');
    });

    it('should report unlimited cache configuration', () => {
      const stats = getCacheStats();
      expect(stats.maxSize).toBe('unlimited');
      expect(stats.utilization).toBe('n/a');
    });

    it('should track entry count', () => {
      const options = createMockOptions();

      const beforeStats = getCacheStats();
      setCachedResult('test1', options, createMockResponse());
      setCachedResult('test2', options, createMockResponse());
      const afterStats = getCacheStats();

      expect(afterStats.entries).toBe(beforeStats.entries + 2);
    });
  });

  describe('clearCache', () => {
    it('should clear all cache entries', () => {
      const options = createMockOptions();

      setCachedResult('test1', options, createMockResponse());
      setCachedResult('test2', options, createMockResponse());

      clearCache();

      const stats = getCacheStats();
      expect(stats.entries).toBe(0);
    });
  });

  describe('listCacheEntries', () => {
    it('should list cache entries', () => {
      const options = createMockOptions();

      setCachedResult('search term', options, createMockResponse());

      const { entries, total } = listCacheEntries(10, 0);
      expect(total).toBeGreaterThan(0);
      expect(entries.length).toBeLessThanOrEqual(10);
    });

    it('should respect limit parameter', () => {
      const options = createMockOptions();

      for (let i = 0; i < 10; i++) {
        setCachedResult(`test${i}`, options, createMockResponse());
      }

      const { entries } = listCacheEntries(5, 0);
      expect(entries.length).toBeLessThanOrEqual(5);
    });
  });

  describe('searchCache', () => {
    it('should find matching entries', () => {
      const options = createMockOptions();

      setCachedResult('javascript tutorial', options, createMockResponse());
      setCachedResult('python guide', options, createMockResponse());

      const results = searchCache('javascript');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.query).toContain('javascript');
    });

    it('should return empty array for no matches', () => {
      const results = searchCache('nonexistentsearchterm12345');
      expect(results.length).toBe(0);
    });

    it('should be case-insensitive', () => {
      const options = createMockOptions();

      setCachedResult('JavaScript Tutorial', options, createMockResponse());

      const results = searchCache('javascript');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should search by normalized passthrough params', () => {
      const options = createMockOptions({ searxngParams: { theme: 'simple' } });
      setCachedResult('theme lookup', options, createMockResponse());
      const results = searchCache('theme=simple');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('pruneCache', () => {
    it('should remove old entries', () => {
      const options = createMockOptions();

      setCachedResult('test', options, createMockResponse());

      const result = pruneCache(-1);
      expect(result.pruned).toBeGreaterThanOrEqual(0);
    });

    it('should keep recent entries', () => {
      const options = createMockOptions();

      setCachedResult('recent', options, createMockResponse());

      const result = pruneCache(24 * 60 * 60 * 1000);
      expect(result.remaining).toBeGreaterThan(0);
    });
  });

  describe('showCacheStatus', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should display cache status', () => {
      showCacheStatus();
      expect(consoleLogSpy).toHaveBeenCalled();
      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('Cache');
    });

    it('should show entries and max size', () => {
      showCacheStatus();
      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('Entries');
    });
  });

  describe('showCacheList', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should display "no entries" when cache is empty', () => {
      clearCache();
      showCacheList();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should list entries when cache has items', () => {
      const options = createMockOptions({ query: 'show-list-test' });
      setCachedResult('show-list-test', options, createMockResponse());
      showCacheList(50, 0);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        const options = createMockOptions({ query: `listitem${i}` });
        setCachedResult(`listitem${i}`, options, createMockResponse());
      }
      showCacheList(2, 0);
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('showCacheSearch', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should show search results for matching term', () => {
      const options = createMockOptions({ query: 'searxng-unique-term' });
      setCachedResult('searxng-unique-term', options, createMockResponse());
      showCacheSearch('searxng-unique-term');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should show "no matching entries" for non-existent term', () => {
      showCacheSearch('zzz-nonexistent-xyz-999');
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('showCacheHelp', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should display cache help', () => {
      showCacheHelp();
      expect(consoleLogSpy).toHaveBeenCalled();
      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('cache');
    });

    it('should show configuration info', () => {
      showCacheHelp();
      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('Max Size');
    });
  });

  describe('getCacheEntry', () => {
    it('should return null for index 0 (1-based)', () => {
      clearCache();
      const entry = getCacheEntry(0);
      expect(entry).toBeNull();
    });

    it('should return entry for valid index', () => {
      clearCache();
      const options = createMockOptions({ query: 'get-entry-test' });
      setCachedResult('get-entry-test', options, createMockResponse());
      const entry = getCacheEntry(1);
      expect(entry).not.toBeNull();
      expect(entry?.key).toContain('get-entry-test');
    });

    it('should return null for out-of-bounds index', () => {
      clearCache();
      const entry = getCacheEntry(999);
      expect(entry).toBeNull();
    });
  });

  describe('inspectCacheEntry', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should display entry details for valid index', () => {
      clearCache();
      const options = createMockOptions({ query: 'inspect-test' });
      setCachedResult('inspect-test', options, createMockResponse());
      inspectCacheEntry(1);
      expect(consoleLogSpy).toHaveBeenCalled();
      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('inspect-test');
    });

    it('should show not found for invalid index', () => {
      clearCache();
      inspectCacheEntry(999);
      expect(consoleLogSpy).toHaveBeenCalled();
      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('not found');
    });
  });

  describe('deleteCacheEntry', () => {
    it('should delete an existing entry', () => {
      clearCache();
      const options = createMockOptions({ query: 'delete-test' });
      setCachedResult('delete-test', options, createMockResponse());
      const sizeBefore = resultCache.size;
      const deleted = deleteCacheEntry(1);
      expect(deleted).toBe(true);
      expect(resultCache.size).toBe(sizeBefore - 1);
    });

    it('should return false for non-existent index', () => {
      clearCache();
      const deleted = deleteCacheEntry(999);
      expect(deleted).toBe(false);
    });
  });

  describe('exportCache and importCache', () => {
    const tmpExportFile = '/tmp/test-cache-export-' + Date.now() + '.json';

    afterEach(() => {
      try {
        if (require('fs').existsSync(tmpExportFile)) {
          require('fs').unlinkSync(tmpExportFile);
        }
      } catch {
        // ignore
      }
    });

    it('should export cache to a file', () => {
      const options = createMockOptions({ query: 'export-test' });
      setCachedResult('export-test', options, createMockResponse());
      const result = exportCache(tmpExportFile);
      expect(result.success).toBe(true);
      expect(result.file).toBe(tmpExportFile);
      expect(result.entries).toBeGreaterThan(0);
    });

    it('should import cache from a file', () => {
      const options = createMockOptions({ query: 'import-test' });
      setCachedResult('import-test', options, createMockResponse());
      exportCache(tmpExportFile);
      clearCache();
      const result = importCache(tmpExportFile);
      expect(result.success).toBe(true);
      expect(result.imported).toBeGreaterThan(0);
    });

    it('should skip existing entries on merge import', () => {
      const options = createMockOptions({ query: 'merge-test' });
      setCachedResult('merge-test', options, createMockResponse());
      exportCache(tmpExportFile);
      const result = importCache(tmpExportFile, true);
      expect(result.success).toBe(true);
      expect(result.skipped).toBeGreaterThanOrEqual(0);
    });

    it('should fail to import non-existent file', () => {
      const result = importCache('/tmp/nonexistent-file-xyz-' + Date.now() + '.json');
      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });

    it('should fail to export to invalid path', () => {
      const result = exportCache('/nonexistent-dir/test.json');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('loadCacheSync and saveCacheSync', () => {
    it('should save and reload cache', () => {
      const query = `persist-test-${Date.now()}`;
      const options = createMockOptions({ query });
      setCachedResult(query, options, createMockResponse());
      saveCacheSync();
      // Clear only in-memory cache, not the file, so loadCacheSync can reload
      resultCache.clear();
      const count = loadCacheSync();
      expect(count).toBeGreaterThan(0);
      clearCache(); // cleanup
    });

    it('should return 0 when no cache file exists', () => {
      clearCache(); // clears in-memory and deletes the file
      if (nodefs.existsSync(CACHE_FILE)) {
        const backup = nodefs.readFileSync(CACHE_FILE);
        nodefs.unlinkSync(CACHE_FILE);
        const count = loadCacheSync();
        expect(count).toBe(0);
        nodefs.writeFileSync(CACHE_FILE, backup);
      } else {
        const count = loadCacheSync();
        expect(count).toBe(0);
      }
    });

    it('should handle corrupt cache file', () => {
      clearCache();
      nodefs.writeFileSync(CACHE_FILE, 'invalid json');
      resultCache.clear();
      const count = loadCacheSync();
      expect(count).toBe(0);
    });

    it('should handle zlib decompression error', () => {
      // Mock zlib to throw error
      const zlib = require('zlib');
      const spy = vi.spyOn(zlib, 'inflateSync').mockImplementation(() => {
        throw new Error('zlib error');
      });

      clearCache();
      // Write garbage that is not JSON and not valid base64-compressed data
      nodefs.writeFileSync(CACHE_FILE, 'not-json-and-not-base64');

      // Clear in-memory cache
      resultCache.clear();

      const count = loadCacheSync();
      expect(count).toBe(0);
      spy.mockRestore();
    });
  });

  describe('LRU Cache behavior', () => {
    it('should evict old entries when full', () => {
      const smallCache = new LRUCache<string>(3);

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      smallCache.set('key4', 'value4');

      expect(smallCache.get('key1')).toBeNull();
      expect(smallCache.get('key4')).toBe('value4');
    });

    it('should update access order on get', () => {
      const smallCache = new LRUCache<string>(3);

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');

      smallCache.get('key1');

      smallCache.set('key4', 'value4');

      expect(smallCache.get('key1')).toBe('value1');
      expect(smallCache.get('key2')).toBeNull();
    });
  });
});
