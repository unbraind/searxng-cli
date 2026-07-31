import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { formatAndOutput, ensureCacheLoaded, resetCacheLoaded, performSearch } from '@/index';
import { setCachedResult, clearCache } from '@/cache/index';
import { createTestSearchOptions as createMockOptions } from '../helpers/search-options';
import type { SearchResponse } from '@/types/index';
import * as validation from '@/formatters/validation';

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

  it('should output results in RSS format', async () => {
    await formatAndOutput(createMockResponse(), createMockOptions({ format: 'rss' }));
    const output = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('<rss version="2.0">');
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
    const tmpFile = join(tmpdir(), `test-output-${Date.now()}.toon`);
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
    const tmpFile = join(tmpdir(), `test-export-${Date.now()}.json`);
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

  it('covers content fetching, embeddings, and title fallbacks', async () => {
    const stderrDescriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('<html><body><main>Fetched article text</main></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    );
    try {
      const fetched = await formatAndOutput(
        createMockResponse({ results: [{ title: 'Article', url: 'https://example.com/article' }] }),
        createMockOptions({ fetchContent: true, exportEmbeddings: true, dedup: false })
      );
      expect(fetched.results?.[0]).toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Fetching'));

      await formatAndOutput(
        createMockResponse({
          results: [
            { link: 'https://example.com/link-only' },
            {},
          ] as unknown as SearchResponse['results'],
        }),
        createMockOptions({ titlesOnly: true, limit: 0, dedup: false, unescape: true })
      );
      expect(consoleLogSpy.mock.calls.flat().join('\n')).toContain('No title');
    } finally {
      fetchSpy.mockRestore();
      if (stderrDescriptor) Object.defineProperty(process.stderr, 'isTTY', stderrDescriptor);
    }
  });

  it('covers silent URL fallbacks and unlimited title/url slices', async () => {
    const data = createMockResponse({
      results: [
        { title: 'One', link: 'https://example.com/link' },
        { title: 'Two' },
      ] as unknown as SearchResponse['results'],
    });
    await formatAndOutput(data, createMockOptions({ silent: true, limit: 0, dedup: false }));
    expect(consoleLogSpy).toHaveBeenCalledWith('https://example.com/link');
    expect(consoleLogSpy).toHaveBeenCalledWith('');

    await formatAndOutput(
      createMockResponse(),
      createMockOptions({ titlesOnly: true, limit: 0, dedup: false })
    );
    await formatAndOutput(
      createMockResponse(),
      createMockOptions({ urlsOnly: true, limit: 2, dedup: false })
    );
  });

  it('validates JSONL and regular output and supports system prompts', async () => {
    await formatAndOutput(
      createMockResponse(),
      createMockOptions({
        jsonl: true,
        validateOutput: true,
        verbose: true,
        silent: false,
        dedup: false,
      })
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('validated'));

    await formatAndOutput(
      createMockResponse({ results: [] }),
      createMockOptions({ jsonl: true, validateOutput: false, dedup: false })
    );
    await formatAndOutput(
      createMockResponse(),
      createMockOptions({
        format: 'jsonl',
        jsonl: false,
        validateOutput: true,
        verbose: true,
        systemPrompt: 'Use only these sources.',
      })
    );
    expect(consoleLogSpy.mock.calls.flat().join('\n')).toContain('<system_prompt>');

    const validationSpy = vi.spyOn(validation, 'validateFormattedOutput').mockReturnValueOnce({
      valid: false,
      message: 'forced invalid output',
    });
    await expect(
      formatAndOutput(
        createMockResponse(),
        createMockOptions({ format: 'json', validateOutput: true })
      )
    ).rejects.toThrow('Output validation failed');
    validationSpy.mockRestore();
  });

  it('covers remaining formatter and citation branches', async () => {
    await formatAndOutput(createMockResponse(), createMockOptions({ format: 'html' }));
    await formatAndOutput(createMockResponse(), createMockOptions({ citation: true }));
    await formatAndOutput(
      createMockResponse({ results: undefined }),
      createMockOptions({ domainFilter: 'example.com', dedup: false })
    );
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('covers nullable formatter inputs and quiet validation variants', async () => {
    const fallbackResults = [
      { link: 'https://example.com/link-only' },
      {},
    ] as unknown as SearchResponse['results'];
    await formatAndOutput(
      createMockResponse({ results: fallbackResults }),
      createMockOptions({ urlsOnly: true, limit: 0, dedup: false })
    );
    await formatAndOutput(
      createMockResponse({ results: undefined }),
      createMockOptions({ metadata: true, compact: true, dedup: false })
    );
    await formatAndOutput(
      createMockResponse({ results: undefined }),
      createMockOptions({ cluster: 'domain', dedup: false })
    );
    await formatAndOutput(
      createMockResponse(),
      createMockOptions({ analyze: true, agent: true, format: 'toon' })
    );
    await formatAndOutput(
      createMockResponse(),
      createMockOptions({ analyze: true, agent: false, compact: true })
    );
    await formatAndOutput(
      createMockResponse(),
      createMockOptions({
        jsonl: true,
        validateOutput: true,
        verbose: true,
        silent: true,
        dedup: false,
      })
    );
    await formatAndOutput(
      createMockResponse(),
      createMockOptions({
        format: 'json',
        validateOutput: true,
        verbose: true,
        silent: true,
      })
    );
    await formatAndOutput(
      createMockResponse({ results: [] }),
      createMockOptions({
        jsonl: true,
        validateOutput: true,
        verbose: true,
        silent: true,
        dedup: false,
      })
    );
    await formatAndOutput(
      createMockResponse({ results: undefined }),
      createMockOptions({ analyze: true, agent: false, compact: false, dedup: false })
    );
    await formatAndOutput(
      createMockResponse({ results: [] }),
      createMockOptions({
        format: 'json',
        validateOutput: true,
        verbose: true,
        silent: true,
        dedup: false,
      })
    );
    await formatAndOutput(
      createMockResponse(),
      createMockOptions({ format: 'unknown' as 'json', pretty: true })
    );
  });

  it('covers quiet content fetching and offline-first output', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('<html><body>content</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    );
    await formatAndOutput(
      createMockResponse({ results: [{ title: 'Page', url: 'https://example.com' }] }),
      createMockOptions({ fetchContent: true, silent: true, dedup: false })
    );
    fetchSpy.mockRestore();

    clearCache();
    const result = await performSearch(
      createMockOptions({
        query: `quiet-offline-${Date.now()}`,
        offlineFirst: true,
        noCache: false,
        silent: true,
      })
    );
    expect(result?.results).toEqual([]);
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

  it('reports exact and semantic cache hits without blocking on network refreshes', async () => {
    clearCache();
    const exactOptions = createMockOptions({
      query: 'exact verbose cache',
      noCache: false,
      verbose: true,
      retries: 0,
    });
    setCachedResult(
      exactOptions.query,
      exactOptions,
      createMockResponse({ query: exactOptions.query })
    );
    const fetchSpy = vi.spyOn(global, 'fetch');
    expect(await performSearch(exactOptions)).not.toBeNull();
    expect(consoleErrorSpy.mock.calls.flat().join('\n')).toContain('CACHE HIT');

    clearCache();
    const seedOptions = createMockOptions({
      query: 'typescript guide',
      noCache: false,
      retries: 0,
    });
    setCachedResult(
      seedOptions.query,
      seedOptions,
      createMockResponse({ query: seedOptions.query })
    );
    const semanticOptions = createMockOptions({
      query: 'typescript guides',
      noCache: false,
      verbose: true,
      retries: 0,
    });
    expect(await performSearch(semanticOptions)).not.toBeNull();
    expect(consoleErrorSpy.mock.calls.flat().join('\n')).toContain('semantic cached result');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('returns an explicit empty response for offline-first cache misses', async () => {
    clearCache();
    const result = await performSearch(
      createMockOptions({
        query: `offline-miss-${Date.now()}`,
        offlineFirst: true,
        noCache: false,
        silent: false,
      })
    );
    expect(result?.results).toEqual([]);
    expect(result?.timing).toBe('offline');
    expect(consoleErrorSpy.mock.calls.flat().join('\n')).toContain('Offline-first');
  });

  it('auto-refines an empty broad search exactly once', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes('one+two+three+four+five+six+seven')
        ? { results: [] }
        : createMockResponse();
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    });
    const options = createMockOptions({
      query: 'one two three four five six seven',
      autoRefine: true,
      noCache: true,
      retries: 0,
      silent: false,
    });
    const result = await performSearch(options);
    expect(
      result,
      JSON.stringify({ calls: fetchSpy.mock.calls.length, errors: consoleErrorSpy.mock.calls })
    ).not.toBeNull();
    expect(options.query).toBe('one two three four five');
    expect(options.autoRefine).toBe(false);
    fetchSpy.mockRestore();
  });

  it('keeps stop-word-only auto-refinement stable and supports quiet refinement', async () => {
    const stableFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const stable = createMockOptions({
      query: 'the and',
      autoRefine: true,
      noCache: true,
      retries: 0,
      silent: false,
    });
    expect(await performSearch(stable)).not.toBeNull();
    expect(stable.query).toBe('the and');
    stableFetch.mockRestore();

    const quietFetch = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const isBroad = String(input).includes('one+two+three+four+five+six');
      return Promise.resolve(
        new Response(JSON.stringify(isBroad ? { results: [] } : createMockResponse()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    });
    const quiet = createMockOptions({
      query: 'one two three four five six',
      autoRefine: true,
      noCache: true,
      retries: 0,
      silent: true,
    });
    expect(await performSearch(quiet)).not.toBeNull();
    expect(quiet.query).toBe('one two three four five');
    quietFetch.mockRestore();
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
