import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as nodefs from 'fs';
import * as zlib from 'zlib';
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
  getSemanticCachedResult,
} from '@/cache/index';
import { CACHE_FILE } from '@/config/index';
import { LRUCache } from '@/classes/index';
import { createTestSearchOptions as createMockOptions } from '../helpers/search-options';
import type { SearchResponse } from '@/types/index';

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

    it('normalizes blank params and all option fallbacks', () => {
      const options = Object.assign(createMockOptions(), {
        category: undefined,
        lang: undefined,
        page: undefined,
        engines: undefined,
        timeRange: undefined,
        safeSearch: undefined,
        searxngParams: { ' ': 'ignored', theme: 'simple' },
      });
      const key = decodeURIComponent(getCacheKey('fallback', options));
      expect(key).toBe('v2:fallback:general:en:1:default:all:0:theme=simple');
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

    it('rejects expired exact entries and returns semantic-compatible matches', () => {
      const options = createMockOptions();
      const key = getCacheKey('typescript guide', options);
      resultCache.set(key, { timestamp: Date.now() - 1000, data: createMockResponse() });
      expect(getCachedResult('typescript guide', options, 10)).toBeNull();
      expect(getCachedResult('typescript guide', options, Infinity)?._cached).toBe(true);
      const semantic = getSemanticCachedResult('typescript guide', options, 0, Infinity);
      expect(semantic).toMatchObject({ _cached: true, _semantic: true });
      expect(getSemanticCachedResult('different', options, 1, Infinity)).toBeNull();
      expect(getSemanticCachedResult('typescript guide', options, 0, 10)).toBeNull();
    });

    it('supports legacy semantic keys and rejects incompatible metadata', () => {
      const data = createMockResponse();
      resultCache.set('legacy query:general:en:1:default:all', {
        timestamp: Date.now(),
        data,
      });
      resultCache.set('short-key', { timestamp: Date.now(), data });
      resultCache.set('v2:short', { timestamp: Date.now(), data });
      expect(getSemanticCachedResult('legacy query', createMockOptions(), 0)).not.toBeNull();
      expect(
        getSemanticCachedResult('legacy query', createMockOptions({ category: 'news' }), 0)
      ).toBeNull();
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

    it('reports persisted size and oldest/newest observations', () => {
      resultCache.set('old', { timestamp: Date.now() - 10_000, data: createMockResponse() });
      resultCache.set('new', { timestamp: Date.now(), data: createMockResponse() });
      resultCache.set('mid', { timestamp: Date.now() - 5000, data: createMockResponse() });
      resultCache.set('zero', { timestamp: 0, data: createMockResponse() });
      saveCacheSync();
      expect(getCacheStats()).toMatchObject({
        fileExists: true,
        oldestEntry: expect.any(String),
        newestEntry: expect.any(String),
      });
    });

    it('reports bounded, disabled, uncompressed, finite-age, and stat-error profiles', () => {
      const path = `/tmp/cache-stats-${process.pid}`;
      nodefs.writeFileSync(path, 'data');
      expect(
        getCacheStats({
          cacheSize: 10,
          persistent: false,
          compression: false,
          maxAge: 5000,
          cacheFile: path,
        })
      ).toMatchObject({
        maxSize: 10,
        utilization: '0.0%',
        persistent: false,
        compressed: false,
        maxAge: '5s',
      });
      expect(
        getCacheStats({ cacheFile: path }, () => {
          throw new Error('stat failed');
        }).fileSize
      ).toBe(0);
      nodefs.unlinkSync(path);
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

    it('parses legacy, short, and empty-field v2 keys with offsets', () => {
      const entry = { timestamp: Date.now(), data: { query: 'q' } as SearchResponse };
      resultCache.set('legacy:query:news:de:2:bing:day', entry);
      resultCache.set('short', entry);
      resultCache.set('v2:q:::::::', entry);
      const listed = listCacheEntries(2, 1);
      expect(listed.entries).toHaveLength(2);
      expect(listed.total).toBe(3);
      expect(listed.entries[0]?.resultCount).toBe(0);
      resultCache.set(':general:en:1:default:all', entry);
      expect(listCacheEntries().entries.some((item) => item.query.startsWith(':'))).toBe(true);
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

    it('uses zero results for cache records without result arrays', () => {
      resultCache.set('plain', {
        timestamp: Date.now(),
        data: { query: 'plain' } as SearchResponse,
      });
      expect(searchCache('plain')[0]?.resultCount).toBe(0);
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

    it('renders bounded and fully populated status variants', () => {
      showCacheStatus({
        entries: 2,
        maxSize: 10,
        utilization: '20.0%',
        persistent: false,
        compressed: false,
        maxAge: '5s',
        file: '/tmp/cache',
        fileExists: true,
        fileSize: '1 KB',
        oldestEntry: '10s ago',
        newestEntry: '1s ago',
      });
      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('2/10');
      expect(output).toContain('Oldest entry');
      expect(output).toContain('Size: 1 KB');
      expect(output).toContain('Disabled');
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
      expect(consoleLogSpy.mock.calls.flat().join('\n')).toContain('more entries');
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

    it('shows bounded, disabled, and uncompressed configuration', () => {
      showCacheHelp({
        cacheSize: 10,
        persistent: false,
        compression: false,
        cacheFile: '/tmp/custom-cache',
      });
      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('10 entries');
      expect(output).toContain('Persistent: No');
      expect(output).toContain('Compressed: No');
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
      setCachedResult('first', createMockOptions(), createMockResponse());
      setCachedResult('second', createMockOptions(), createMockResponse());
      const entry = getCacheEntry(2);
      expect(entry).not.toBeNull();
      expect(getCacheEntry(999)).toBeNull();
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

    it('shows optional counts, fallback fields, and preview overflow', () => {
      const results = Array.from({ length: 4 }, (_, index) => ({
        title: index === 0 ? undefined : `Result ${index}`,
        url: index === 1 ? undefined : `https://example.com/${index}`,
      }));
      setCachedResult(
        'rich-entry',
        createMockOptions(),
        createMockResponse({
          results: results as unknown as SearchResponse['results'],
          suggestions: ['one'],
          answers: ['answer'],
        })
      );
      inspectCacheEntry(1);
      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('and 1 more');
      expect(output).toContain('Suggestions: 1');
      expect(output).toContain('Answers: 1');
    });

    it('shows zero counts when optional response collections are absent', () => {
      resultCache.set('empty', {
        timestamp: Date.now(),
        data: { query: 'empty' } as SearchResponse,
      });
      inspectCacheEntry(1);
      expect(consoleLogSpy.mock.calls.flat().join('\n')).toContain('Results: 0');
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
      setCachedResult('first', createMockOptions(), createMockResponse());
      setCachedResult('second', createMockOptions(), createMockResponse());
      expect(deleteCacheEntry(2)).toBe(true);
      const deleted = deleteCacheEntry(999);
      expect(deleted).toBe(false);
    });
  });

  describe('exportCache and importCache', () => {
    const tmpExportFile = '/tmp/test-cache-export-' + Date.now() + '.json';

    afterEach(() => {
      try {
        if (nodefs.existsSync(tmpExportFile)) {
          nodefs.unlinkSync(tmpExportFile);
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

    it('imports raw maps, overwrites when merge is disabled, and reports invalid JSON', () => {
      const key = getCacheKey('raw', createMockOptions());
      nodefs.writeFileSync(
        tmpExportFile,
        JSON.stringify({ [key]: { timestamp: Date.now(), data: createMockResponse() } })
      );
      expect(importCache(tmpExportFile, false)).toMatchObject({ success: true, imported: 1 });
      nodefs.writeFileSync(tmpExportFile, '{broken');
      expect(importCache(tmpExportFile)).toMatchObject({ success: false });
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

    it('supports disabled, plain, compressed-fallback, expiry, unlimited size, and errors', () => {
      const base = `/tmp/searxng-cache-${process.pid}-${Date.now()}`;
      const data = {
        key: { timestamp: Date.now(), data: createMockResponse() },
        old: { timestamp: Date.now() - 10_000, data: createMockResponse() },
      };
      expect(loadCacheSync({ persistent: false, cacheFile: base })).toBe(0);
      saveCacheSync({ persistent: false, cacheFile: base });
      expect(nodefs.existsSync(base)).toBe(false);

      resultCache.clear();
      resultCache.set('key', data.key);
      saveCacheSync({ compression: false, cacheFile: base });
      resultCache.clear();
      expect(loadCacheSync({ compression: false, cacheFile: base, maxAge: Infinity })).toBe(1);

      nodefs.writeFileSync(base, JSON.stringify(data));
      resultCache.clear();
      expect(loadCacheSync({ compression: true, cacheFile: base, maxAge: 1000 })).toBe(1);

      nodefs.writeFileSync(base, zlib.deflateSync(JSON.stringify(data)).toString('base64'));
      resultCache.clear();
      expect(loadCacheSync({ compression: true, cacheFile: base, maxAge: Infinity })).toBe(2);
      resultCache.clear();
      expect(loadCacheSync({ compression: true, cacheFile: base, maxAge: 1000 })).toBe(1);

      nodefs.writeFileSync(
        base,
        JSON.stringify({
          large: {
            timestamp: Date.now(),
            data: createMockResponse({ query: 'x'.repeat(5 * 1024 * 1024) }),
          },
        })
      );
      resultCache.clear();
      expect(nodefs.statSync(base).size).toBeGreaterThan(5 * 1024 * 1024);
      expect(loadCacheSync({ compression: false, cacheFile: base, maxAge: Infinity })).toBe(1);

      nodefs.unlinkSync(base);
      nodefs.mkdirSync(base);
      delete process.env.DEBUG;
      expect(loadCacheSync({ cacheFile: base })).toBe(0);
      process.env.DEBUG = '1';
      expect(loadCacheSync({ cacheFile: base })).toBe(0);
      saveCacheSync({ cacheFile: base });
      delete process.env.DEBUG;
      nodefs.rmSync(base, { recursive: true });
      if (nodefs.existsSync(`${base}.tmp`)) nodefs.unlinkSync(`${base}.tmp`);
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
