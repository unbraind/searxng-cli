import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import { formatAndOutput, ensureCacheLoaded, resetCacheLoaded, performSearch } from '@/index';
import { setCachedResult, clearCache } from '@/cache/index';
import type { SearchResponse, SearchOptions } from '@/types/index';

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
  noCache: true,
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
  results: [
    {
      title: 'Test Result 1',
      url: 'https://example.com/1',
      content: 'Test content 1',
      engine: 'google',
      score: 0.9,
    },
    {
      title: 'Test Result 2',
      url: 'https://example.com/2',
      content: 'Test content 2',
      engine: 'bing',
      score: 0.7,
    },
  ],
  suggestions: ['suggestion 1', 'suggestion 2'],
  answers: ['answer text'],
  number_of_results: 100,
  ...overrides,
});

describe('Index Module - formatAndOutput', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('should output results in toon format by default', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'toon' });
    const result = await formatAndOutput(data, options);
    expect(result).toBe(data);
    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('q:');
    expect(output).toContain('n:');
  });

  it('should output results in json format', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'json' });
    await formatAndOutput(data, options);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should output results in compact json format', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'json', compact: true });
    await formatAndOutput(data, options);
    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('should output results in csv format', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'csv' });
    await formatAndOutput(data, options);
    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('i,title,url');
  });

  it('should output results in markdown format', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'markdown' });
    await formatAndOutput(data, options);
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('# test query');
  });

  it('should output results in md alias format', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'md' });
    await formatAndOutput(data, options);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should output results in yaml format', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'yaml' });
    await formatAndOutput(data, options);
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("query: 'test query'");
  });

  it('should output results in yml alias format', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'yml' });
    await formatAndOutput(data, options);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should output results in table format', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'table' });
    await formatAndOutput(data, options);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should output results in text format', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'text' });
    await formatAndOutput(data, options);
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('test query');
  });

  it('should output results in xml format', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'xml' });
    await formatAndOutput(data, options);
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('<?xml');
  });

  it('should output results in html-report format', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'html-report' });
    await formatAndOutput(data, options);
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('<!DOCTYPE html>');
  });

  it('should output results in raw format', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'raw' });
    await formatAndOutput(data, options);
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as SearchResponse;
    expect(parsed.query).toBe('test query');
  });

  it('should output results in simple format', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'simple' });
    await formatAndOutput(data, options);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should handle unknown format with JSON fallback', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ format: 'unknown' as 'json' });
    await formatAndOutput(data, options);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should output URLs only when urlsOnly is set', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ urlsOnly: true, dedup: false });
    await formatAndOutput(data, options);
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('https://example.com/1');
  });

  it('should output titles only when titlesOnly is set', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ titlesOnly: true, dedup: false });
    await formatAndOutput(data, options);
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('Test Result 1');
  });

  it('should output JSONL when jsonl is set', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ jsonl: true, dedup: false });
    await formatAndOutput(data, options);
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const firstLine = (consoleLogSpy.mock.calls[0]?.[0] as string).split('\n')[0] ?? '';
    const parsed = JSON.parse(firstLine) as Record<string, unknown>;
    expect(parsed.url).toBe('https://example.com/1');
    expect(parsed.format).toBe('jsonl');
  });

  it('should output URLs when silent is set', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ silent: true, dedup: false });
    await formatAndOutput(data, options);
    expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy.mock.calls[0]?.[0]).toBe('https://example.com/1');
  });

  it('should output metadata JSON when metadata is set', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ metadata: true });
    await formatAndOutput(data, options);
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed).toHaveProperty('totalResults');
  });

  it('should output analysis JSON when analyze is set', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ analyze: true });
    await formatAndOutput(data, options);
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed).toHaveProperty('query');
  });

  it('should output quick format when quick is set', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ quick: true });
    await formatAndOutput(data, options);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should output summary format when summary is set', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ summary: true });
    await formatAndOutput(data, options);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should apply deduplication when dedup is set', async () => {
    const data = createMockResponse({
      results: [
        { title: 'Test 1', url: 'https://example.com/dedup1' },
        { title: 'Test 1 Dup', url: 'https://example.com/dedup1' },
        { title: 'Test 2', url: 'https://example.com/dedup2' },
      ],
    });
    const options = createMockOptions({ dedup: true, format: 'toon' });
    const result = await formatAndOutput(data, options);
    expect(result.results?.length).toBeLessThanOrEqual(2);
  });

  it('should apply sort when sort is set', async () => {
    const data = createMockResponse({
      results: [
        { title: 'Low Score', url: 'https://example.com/sort1', score: 0.2 },
        { title: 'High Score', url: 'https://example.com/sort2', score: 0.9 },
      ],
    });
    const options = createMockOptions({ sort: true, dedup: false });
    const result = await formatAndOutput(data, options);
    if (result.results && result.results.length >= 2) {
      expect(result.results[0]?.score ?? 0).toBeGreaterThanOrEqual(result.results[1]?.score ?? 0);
    }
  });

  it('should apply rank when rank is set', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ rank: true, sort: true, query: 'Test Result' });
    const result = await formatAndOutput(data, options);
    expect(result.results).toBeDefined();
  });

  it('should apply domain filter when domainFilter is set', async () => {
    const data = createMockResponse({
      results: [
        { title: 'Keep', url: 'https://example.com/keep' },
        { title: 'Remove', url: 'https://other.com/remove' },
      ],
    });
    const options = createMockOptions({ domainFilter: 'example.com', dedup: false });
    const result = await formatAndOutput(data, options);
    expect(result.results?.length).toBe(1);
    expect(result.results?.[0]?.url).toContain('example.com');
  });

  it('should apply exclude-domain filter', async () => {
    const data = createMockResponse({
      results: [
        { title: 'Keep', url: 'https://example.com/keep' },
        { title: 'Remove', url: 'https://spam.com/remove' },
      ],
    });
    const options = createMockOptions({ excludeDomain: 'spam.com', dedup: false });
    const result = await formatAndOutput(data, options);
    expect(
      result.results?.every((r) => {
        if (!r.url) return true;
        const hostname = new URL(r.url).hostname.toLowerCase();
        return hostname !== 'spam.com' && !hostname.endsWith('.spam.com');
      })
    ).toBe(true);
  });

  it('should save output to file when output path is set', async () => {
    const tmpFile = `/tmp/test-output-${Date.now()}.toon`;
    try {
      const data = createMockResponse();
      const options = createMockOptions({ output: tmpFile, dedup: false });
      await formatAndOutput(data, options);
      expect(fs.existsSync(tmpFile)).toBe(true);
      const content = fs.readFileSync(tmpFile, 'utf8');
      expect(content.length).toBeGreaterThan(0);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  it('should save export to file when export path is set', async () => {
    const tmpFile = `/tmp/test-export-${Date.now()}.json`;
    try {
      const data = createMockResponse();
      // Use compact mode so the output is valid JSON (formatJsonOutput produces human-readable text otherwise)
      const options = createMockOptions({
        export: tmpFile,
        format: 'json',
        compact: true,
        dedup: false,
      });
      await formatAndOutput(data, options);
      expect(fs.existsSync(tmpFile)).toBe(true);
      const content = fs.readFileSync(tmpFile, 'utf8');
      const parsed = JSON.parse(content) as Record<string, unknown>;
      expect(parsed).toHaveProperty('results');
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  it('should show clustered results by domain when cluster=domain', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ cluster: 'domain' });
    await formatAndOutput(data, options);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should show clustered results by engine when cluster=engine', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ cluster: 'engine' });
    await formatAndOutput(data, options);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should limit results to 0 means unlimited', async () => {
    const data = createMockResponse({
      results: Array.from({ length: 20 }, (_, i) => ({
        title: `Result ${i + 1}`,
        url: `https://example${i}.com/${i + 1}`,
      })),
    });
    const options = createMockOptions({ limit: 0, urlsOnly: true });
    await formatAndOutput(data, options);
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    const lines = output.trim().split('\n');
    expect(lines.length).toBe(20);
  });

  it('should output metadata with compact flag', async () => {
    const data = createMockResponse();
    const options = createMockOptions({ metadata: true, compact: true });
    await formatAndOutput(data, options);
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(() => JSON.parse(output)).not.toThrow();
  });
});

describe('Index Module - ensureCacheLoaded', () => {
  it('should load cache on first call and return count', async () => {
    resetCacheLoaded();
    const count = ensureCacheLoaded();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('should return 0 on subsequent calls (already loaded)', async () => {
    resetCacheLoaded();
    ensureCacheLoaded();
    const count = ensureCacheLoaded();
    expect(count).toBe(0);
  });

  it('should reload after reset', async () => {
    resetCacheLoaded();
    const c1 = ensureCacheLoaded();
    resetCacheLoaded();
    const c2 = ensureCacheLoaded();
    expect(typeof c1).toBe('number');
    expect(typeof c2).toBe('number');
  });
});

describe('Index Module - performSearch', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('should return null on network error when silent', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockRejectedValue(Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' }));
    const options = createMockOptions({
      query: 'test-silent-error',
      silent: true,
      noCache: true,
      retries: 0,
    });
    const result = await performSearch(options);
    expect(result).toBeNull();
    fetchSpy.mockRestore();
  });

  it('should log ECONNREFUSED error when not silent', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockRejectedValue(Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' }));
    const options = createMockOptions({
      query: 'test-error',
      silent: false,
      noCache: true,
      retries: 0,
    });
    await performSearch(options);
    expect(consoleErrorSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('should log generic error message when not silent', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Some network error'));
    const options = createMockOptions({
      query: 'test-generic-err',
      silent: false,
      noCache: true,
      retries: 0,
    });
    await performSearch(options);
    expect(consoleErrorSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('should use cached result when available and noCache=false', async () => {
    clearCache();
    const query = `cached-query-${Date.now()}`;
    const mockData = createMockResponse({ query });
    const opts = createMockOptions({ query, noCache: false });
    setCachedResult(query, opts, mockData);
    const result = await performSearch(opts);
    expect(result).not.toBeNull();
    expect(result?._cached).toBe(true);
  });

  it('should fetch fresh results when noCache=true', async () => {
    const mockData = createMockResponse({ query: 'fresh-query' });
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
      status: 200,
      statusText: 'OK',
    } as Response);
    const options = createMockOptions({ query: 'fresh-query', noCache: true, retries: 0 });
    const result = await performSearch(options);
    expect(result).not.toBeNull();
    fetchSpy.mockRestore();
  });

  it('should return null for HTTP error response', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({}),
    } as Response);
    const options = createMockOptions({
      query: 'http-error',
      silent: true,
      noCache: true,
      retries: 0,
    });
    const result = await performSearch(options);
    expect(result).toBeNull();
    fetchSpy.mockRestore();
  });

  it('should log verbose request details', async () => {
    const mockData = createMockResponse();
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
      status: 200,
      statusText: 'OK',
    } as Response);
    const options = createMockOptions({
      query: 'verbose-test',
      verbose: true,
      noCache: true,
      retries: 0,
    });
    await performSearch(options);
    expect(consoleErrorSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('should log AbortError as timeout when not silent', async () => {
    const abortErr = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(abortErr);
    const options = createMockOptions({
      query: 'timeout-test',
      silent: false,
      noCache: true,
      retries: 0,
    });
    await performSearch(options);
    expect(consoleErrorSpy).toHaveBeenCalled();
    const errorMsg = (consoleErrorSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(errorMsg).toContain('timed out');
    fetchSpy.mockRestore();
  });
});
