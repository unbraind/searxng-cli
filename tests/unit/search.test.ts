import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildUrl,
  calculateRelevanceScore,
  rankResults,
  applyAdvancedFilters,
  extractMetadata,
  deduplicateResults,
  sortByScore,
  expandQuery,
  clusterByDomain,
  clusterByEngine,
  analyzeResults,
  fetchWebpageContent,
  validateRemoteContentUrl,
  showClusteredResults,
  generateVectorEmbeddings,
  autoRefineQuery,
} from '@/search/index';
import { createTestSearchOptions as createMockOptions } from '../helpers/search-options';
import type { AdvancedFilters, SearchResult } from '@/types/index';

const createMockResult = (overrides: Partial<SearchResult> = {}): SearchResult => ({
  title: 'Test Result',
  url: 'https://example.com/test',
  content: 'Test content for the result',
  engine: 'google',
  score: 1.0,
  ...overrides,
});

describe('Search Module', () => {
  describe('buildUrl', () => {
    it('should build URL with required parameters', () => {
      const options = createMockOptions();
      const url = buildUrl(options);
      expect(url.toString()).toContain('/search?');
      expect(url.toString()).toContain('q=test+query');
      expect(url.toString()).toContain('format=json');
      expect(url.toString()).toContain('pageno=1');
      expect(url.toString()).toContain('safesearch=0');
    });

    it('should include engines parameter when specified', () => {
      const options = createMockOptions({ engines: 'google,bing' });
      const url = buildUrl(options);
      expect(url.toString()).toContain('engines=google%2Cbing');
    });

    it('should include language parameter when specified', () => {
      const options = createMockOptions({ lang: 'de' });
      const url = buildUrl(options);
      expect(url.toString()).toContain('language=de');
    });

    it('should include time range parameter when specified', () => {
      const options = createMockOptions({ timeRange: 'day' });
      const url = buildUrl(options);
      expect(url.toString()).toContain('time_range=day');
    });

    it('should include category parameter when specified', () => {
      const options = createMockOptions({ category: 'images' });
      const url = buildUrl(options);
      expect(url.toString()).toContain('categories=images');
    });

    it('should include passthrough SearXNG parameters', () => {
      const options = createMockOptions({
        searxngParams: {
          image_proxy: 'true',
          theme: 'simple',
        },
      });
      const url = buildUrl(options);
      expect(url.toString()).toContain('image_proxy=true');
      expect(url.toString()).toContain('theme=simple');
    });

    it('should preserve canonical core params when passthrough tries to override them', () => {
      const options = createMockOptions({
        query: 'canonical query',
        page: 3,
        safeSearch: 2,
        lang: 'en-US',
        engines: 'google',
        category: 'news',
        searxngParams: {
          q: 'overridden query',
          format: 'html',
          pageno: '99',
          safesearch: '0',
          language: 'fr',
          engines: 'bing',
          categories: 'images',
          image_proxy: 'true',
        },
      });

      const url = buildUrl(options);
      expect(url.searchParams.get('q')).toBe('canonical query');
      expect(url.searchParams.get('format')).toBe('json');
      expect(url.searchParams.get('pageno')).toBe('3');
      expect(url.searchParams.get('safesearch')).toBe('2');
      expect(url.searchParams.get('language')).toBe('en-US');
      expect(url.searchParams.get('engines')).toBe('google');
      expect(url.searchParams.get('categories')).toBe('news');
      expect(url.searchParams.get('image_proxy')).toBe('true');
    });

    it('ignores blank passthrough parameter names', () => {
      const url = buildUrl(createMockOptions({ searxngParams: { ' ': 'ignored' } }));
      expect(url.searchParams.has(' ')).toBe(false);
    });
  });

  describe('calculateRelevanceScore', () => {
    it('should give higher scores for title matches', () => {
      const result = createMockResult({ title: 'JavaScript Tutorial Guide' });
      const score = calculateRelevanceScore(result, 'javascript');
      expect(score).toBeGreaterThan(0);
    });

    it('should give points for content matches', () => {
      const result = createMockResult({ content: 'Learn programming with examples' });
      const score = calculateRelevanceScore(result, 'programming');
      expect(score).toBeGreaterThan(0);
    });

    it('should give points for URL matches', () => {
      const result = createMockResult({ url: 'https://programming.example.com/guide' });
      const score = calculateRelevanceScore(result, 'programming');
      expect(score).toBeGreaterThan(0);
    });

    it('should give bonus for trusted domains', () => {
      const githubResult = createMockResult({ url: 'https://github.com/user/repo' });
      const otherResult = createMockResult({ url: 'https://random-site.com/page' });
      const githubScore = calculateRelevanceScore(githubResult, 'test');
      const otherScore = calculateRelevanceScore(otherResult, 'test');
      expect(githubScore).toBeGreaterThan(otherScore);
    });

    it('handles missing fields, invalid URLs, short terms, and trusted categories', () => {
      const missing = { score: 'invalid' } as unknown as SearchResult;
      expect(calculateRelevanceScore(missing, 'a valid')).toBe(0);
      expect(calculateRelevanceScore(createMockResult({ url: 'not a url' }), 'none')).toBe(5);
      for (const url of [
        'https://docs.example.com',
        'https://university.edu',
        'https://agency.gov',
        'https://sub.wikipedia.org',
      ]) {
        expect(calculateRelevanceScore(createMockResult({ url }), 'none')).toBe(10);
      }
    });
  });

  describe('rankResults', () => {
    it('should add relevance scores to results', () => {
      const results = [
        createMockResult({ title: 'JavaScript Guide', url: 'https://example.com/1' }),
        createMockResult({ title: 'Python Tutorial', url: 'https://example.com/2' }),
      ];
      const ranked = rankResults(results, 'javascript');
      expect(ranked[0]?.relevanceScore).toBeDefined();
      expect(ranked[0]?.relevanceScore).toBeGreaterThan(ranked[1]?.relevanceScore ?? 0);
    });

    it('should sort results by relevance score', () => {
      const results = [
        createMockResult({ title: 'Random Page', url: 'https://example.com/1' }),
        createMockResult({ title: 'JavaScript Complete Guide', url: 'https://example.com/2' }),
      ];
      const ranked = rankResults(results, 'javascript');
      expect(ranked[0]?.title).toBe('JavaScript Complete Guide');
    });
  });

  describe('applyAdvancedFilters', () => {
    it('should filter by domain', () => {
      const results = [
        createMockResult({ url: 'https://github.com/repo' }),
        createMockResult({ url: 'https://example.com/page' }),
      ];
      const filtered = applyAdvancedFilters(results, {
        domain: 'github.com',
        excludeDomain: null,
        minScore: null,
        hasImage: false,
        dateAfter: null,
        dateBefore: null,
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.url).toContain('github.com');
    });

    it('should exclude domains', () => {
      const results = [
        createMockResult({ url: 'https://github.com/repo' }),
        createMockResult({ url: 'https://example.com/page' }),
      ];
      const filtered = applyAdvancedFilters(results, {
        domain: null,
        excludeDomain: 'github.com',
        minScore: null,
        hasImage: false,
        dateAfter: null,
        dateBefore: null,
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.url).toContain('example.com');
    });

    it('should filter by minimum score', () => {
      const results = [createMockResult({ score: 0.8 }), createMockResult({ score: 0.3 })];
      const filtered = applyAdvancedFilters(results, {
        domain: null,
        excludeDomain: null,
        minScore: '0.5',
        hasImage: false,
        dateAfter: null,
        dateBefore: null,
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.score).toBe(0.8);
    });

    it('should filter by hasImage', () => {
      const results = [
        createMockResult({ thumbnail: 'https://example.com/thumb.jpg' }),
        createMockResult({}),
      ];
      const filtered = applyAdvancedFilters(results, {
        domain: null,
        excludeDomain: null,
        minScore: null,
        hasImage: true,
        dateAfter: null,
        dateBefore: null,
      });
      expect(filtered.length).toBe(1);
    });

    it('handles subdomains, invalid URLs, score fallbacks, and date boundaries', () => {
      const results = [
        createMockResult({
          url: 'https://docs.example.com/a',
          score: undefined,
          publishedDate: undefined,
          img_src: 'image.png',
        }),
        createMockResult({
          url: 'invalid',
          score: 1,
          publishedDate: '2026-01-15',
        }),
        createMockResult({
          url: 'https://other.test',
          score: 0.7,
          publishedDate: '2026-02-01',
        }),
      ];
      expect(
        applyAdvancedFilters(results, {
          domain: ' example.com , absent.test ',
          excludeDomain: null,
          minScore: null,
          hasImage: false,
          dateAfter: null,
          dateBefore: null,
        })
      ).toHaveLength(1);
      expect(
        applyAdvancedFilters(results, {
          domain: null,
          excludeDomain: 'example.com',
          minScore: '0.5',
          hasImage: false,
          dateAfter: '2026-01-01',
          dateBefore: '2026-01-31',
        })
      ).toEqual([results[1]]);
      expect(
        applyAdvancedFilters(results, {
          domain: null,
          excludeDomain: null,
          minScore: null,
          hasImage: true,
          dateAfter: null,
          dateBefore: null,
        })
      ).toEqual([results[0]]);
      const baseFilters: AdvancedFilters = {
        domain: null,
        excludeDomain: null,
        minScore: null,
        hasImage: false,
        dateAfter: null,
        dateBefore: null,
      };
      expect(
        applyAdvancedFilters([createMockResult({ url: undefined })], {
          ...baseFilters,
          domain: 'example.com',
        })
      ).toEqual([]);
      expect(
        applyAdvancedFilters([createMockResult({ url: undefined })], {
          ...baseFilters,
          excludeDomain: 'example.com',
        })
      ).toHaveLength(1);
      expect(
        applyAdvancedFilters([createMockResult({ score: undefined })], {
          ...baseFilters,
          minScore: '0.1',
        })
      ).toEqual([]);
      for (const key of ['dateAfter', 'dateBefore'] as const) {
        expect(
          applyAdvancedFilters([createMockResult({ publishedDate: undefined })], {
            ...baseFilters,
            [key]: '2026-01-01',
          })
        ).toEqual([]);
      }
    });
  });

  describe('extractMetadata', () => {
    it('should extract domain counts', () => {
      const results = [
        createMockResult({ url: 'https://github.com/repo1' }),
        createMockResult({ url: 'https://github.com/repo2' }),
        createMockResult({ url: 'https://example.com/page' }),
      ];
      const metadata = extractMetadata(results);
      expect(metadata.totalResults).toBe(3);
      expect(metadata.uniqueDomains).toBe(2);
    });

    it('should count results with images', () => {
      const results = [
        createMockResult({ thumbnail: 'image.jpg' }),
        createMockResult({}),
        createMockResult({ img_src: 'image.png' }),
      ];
      const metadata = extractMetadata(results);
      expect(metadata.types.withImages).toBe(2);
    });

    it('normalizes malformed and optional metadata', () => {
      const metadata = extractMetadata([
        createMockResult({
          url: 'https://www.example.com/a',
          engine: undefined,
          engines: ['bing'],
        }),
        createMockResult({ url: 'https://example.com/b', engine: undefined, engines: undefined }),
        createMockResult({
          url: 'invalid',
          score: undefined,
          publishedDate: '2026-01-01',
        }),
        createMockResult({ url: undefined }),
      ]);
      expect(metadata.domains).toEqual([['example.com', 2]]);
      expect(Object.fromEntries(metadata.engines)).toEqual({ bing: 1, unknown: 1, google: 2 });
      expect(metadata.types).toMatchObject({ withDates: 1, withScores: 3 });
    });
  });

  describe('deduplicateResults', () => {
    it('should remove duplicate URLs', () => {
      const results = [
        createMockResult({ url: 'https://example.com/1', title: 'First' }),
        createMockResult({ url: 'https://example.com/1', title: 'Duplicate' }),
        createMockResult({ url: 'https://example.com/2', title: 'Second' }),
      ];
      const deduped = deduplicateResults(results);
      expect(deduped.length).toBe(2);
    });

    it('should normalize URLs for comparison', () => {
      const results = [
        createMockResult({ url: 'https://www.example.com/page/' }),
        createMockResult({ url: 'http://example.com/page' }),
      ];
      const deduped = deduplicateResults(results);
      expect(deduped.length).toBe(1);
    });

    it('should not leak dedup state across separate calls', () => {
      const first = [createMockResult({ url: 'https://example.com/shared', title: 'First call' })];
      const second = [
        createMockResult({ url: 'https://example.com/shared', title: 'Second call same URL' }),
      ];
      const firstDeduped = deduplicateResults(first);
      const secondDeduped = deduplicateResults(second);
      expect(firstDeduped.length).toBe(1);
      expect(secondDeduped.length).toBe(1);
    });

    it('uses link and empty fallbacks when URL is absent', () => {
      const linked = createMockResult({ url: undefined, link: 'https://example.com/link' });
      const empty = createMockResult({ url: undefined, link: undefined });
      expect(deduplicateResults([linked, linked, empty, empty])).toEqual([linked, empty]);
    });
  });

  describe('sortByScore', () => {
    it('should sort results by score descending', () => {
      const results = [
        createMockResult({ score: 0.5 }),
        createMockResult({ score: 1.0 }),
        createMockResult({ score: 0.7 }),
      ];
      const sorted = sortByScore(results);
      expect(sorted[0]?.score).toBe(1.0);
      expect(sorted[2]?.score).toBe(0.5);
    });

    it('should handle missing scores', () => {
      const results = [
        createMockResult({ score: 0.5 }),
        createMockResult({ score: undefined }),
        createMockResult({ score: 0.7 }),
      ];
      const sorted = sortByScore(results);
      expect(sorted[0]?.score).toBe(0.7);
      expect(sorted[1]?.score).toBe(0.5);
    });
  });

  describe('expandQuery', () => {
    it('should expand !gh alias', () => {
      const expanded = expandQuery('!gh nodejs repo');
      expect(expanded.query).toBe('nodejs repo');
      expect(expanded.engines).toBe('github');
    });

    it('should expand !so alias', () => {
      const expanded = expandQuery('!so javascript error');
      expect(expanded.query).toBe('javascript error');
      expect(expanded.engines).toBe('stackoverflow');
    });

    it('should expand category aliases', () => {
      const expanded = expandQuery('!img cute cats');
      expect(expanded.query).toBe('cute cats');
      expect(expanded.category).toBe('images');
    });

    it('should return unchanged query for non-aliases', () => {
      const expanded = expandQuery('regular search query');
      expect(expanded.query).toBe('regular search query');
      expect(expanded.engines).toBeNull();
    });

    it('supports an exact alias token', () => {
      expect(expandQuery('!img')).toEqual({ query: '', engines: null, category: 'images' });
    });
  });

  describe('clusterByDomain', () => {
    it('should group results by domain', () => {
      const results = [
        createMockResult({ url: 'https://github.com/repo1' }),
        createMockResult({ url: 'https://github.com/repo2' }),
        createMockResult({ url: 'https://example.com/page' }),
      ];
      const clusters = clusterByDomain(results);
      expect(clusters.length).toBe(2);
      const githubCluster = clusters.find((c) => c.domain === 'github.com');
      expect(githubCluster?.count).toBe(2);
    });

    it('should sort clusters by count', () => {
      const results = [
        createMockResult({ url: 'https://a.com/1' }),
        createMockResult({ url: 'https://a.com/2' }),
        createMockResult({ url: 'https://a.com/3' }),
        createMockResult({ url: 'https://b.com/1' }),
      ];
      const clusters = clusterByDomain(results);
      expect(clusters[0]?.domain).toBe('a.com');
    });

    it('uses link fallbacks and ignores malformed results', () => {
      expect(
        clusterByDomain([
          createMockResult({ url: undefined, link: 'https://www.example.com/a' }),
          createMockResult({ url: undefined, link: undefined }),
        ])
      ).toMatchObject([{ domain: 'example.com', count: 1 }]);
    });
  });

  describe('clusterByEngine', () => {
    it('should group results by engine', () => {
      const results = [
        createMockResult({ engine: 'google' }),
        createMockResult({ engine: 'google' }),
        createMockResult({ engine: 'bing' }),
      ];
      const clusters = clusterByEngine(results);
      expect(clusters.length).toBe(2);
      const googleCluster = clusters.find((c) => c.engine === 'google');
      expect(googleCluster?.count).toBe(2);
    });

    it('uses engine-array and unknown fallbacks', () => {
      expect(
        clusterByEngine([
          createMockResult({ engine: undefined, engines: ['bing'] }),
          createMockResult({ engine: undefined, engines: undefined }),
        ]).map((cluster) => cluster.engine)
      ).toEqual(['bing', 'unknown']);
    });
  });

  describe('agent-oriented transformations', () => {
    afterEach(() => vi.restoreAllMocks());

    it('renders domain and engine clusters including overflow summaries', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const results = Array.from({ length: 4 }, (_, index) =>
        createMockResult({
          title: index === 0 ? undefined : `<b>Result ${index}</b>`,
          url: index === 1 ? undefined : `https://example.com/${index}`,
          engine: undefined,
          engines: ['bing'],
        })
      );
      showClusteredResults(results, 'domain');
      showClusteredResults(results, 'engine');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('and 1 more'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Total:'));
    });

    it('generates deterministic vectors from every text fallback', () => {
      const embedded = generateVectorEmbeddings([
        createMockResult({ title: undefined, content: undefined, snippet: 'Snippet' }),
        createMockResult({ title: 'Title', content: 'Content' }),
        createMockResult({ title: undefined, content: undefined, snippet: undefined }),
      ]);
      expect(embedded.every((result) => Array.isArray(result.embeddings))).toBe(true);
    });

    it('refines quoted, long, and stop-word-only queries', () => {
      expect(autoRefineQuery('"one" two three four five six')).toBe('one two three four five');
      expect(autoRefineQuery('the and or')).toBe('the and or');
      expect(autoRefineQuery('a concise query')).toBe('concise query');
    });
  });

  describe('remote content security', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('only applies trusted bonuses to parsed hostname boundaries', () => {
      const trusted = createMockResult({ url: 'https://docs.github.com/actions' });
      const deceptive = createMockResult({ url: 'https://evil.example/github.com/actions' });
      expect(calculateRelevanceScore(trusted, 'unrelated')).toBe(10);
      expect(calculateRelevanceScore(deceptive, 'unrelated')).toBe(5);
    });

    it('rejects non-web, credential-bearing, and private literal targets', () => {
      expect(validateRemoteContentUrl('file:///etc/passwd')).toBeNull();
      expect(validateRemoteContentUrl('https://user:pass@example.com')).toBeNull();
      expect(validateRemoteContentUrl('http://localhost:8080')).toBeNull();
      expect(validateRemoteContentUrl('http://127.0.0.1')).toBeNull();
      expect(validateRemoteContentUrl('http://192.168.1.10')).toBeNull();
      expect(validateRemoteContentUrl('http://[::ffff:7f00:1]')).toBeNull();
      expect(validateRemoteContentUrl('https://example.com/page')?.hostname).toBe('example.com');
    });

    it('covers all reserved IP ranges, IPv6 forms, relative redirects, and malformed input', () => {
      for (const value of [
        'http://0.1.2.3',
        'http://10.0.0.1',
        'http://169.254.1.1',
        'http://172.16.0.1',
        'http://172.31.255.255',
        'http://192.168.1.1',
        'http://100.64.0.1',
        'http://100.127.0.1',
        'http://224.0.0.1',
        'http://[::]',
        'http://[::1]',
        'http://[fc00::1]',
        'http://[fd00::1]',
        'http://[fe80::1]',
        'http://host.localhost',
      ]) {
        expect(validateRemoteContentUrl(value)).toBeNull();
      }
      expect(validateRemoteContentUrl('not a URL')).toBeNull();
      expect(
        validateRemoteContentUrl('/next', new URL('https://example.com/start'))?.pathname
      ).toBe('/next');
      expect(validateRemoteContentUrl('http://172.32.0.1')).not.toBeNull();
      expect(validateRemoteContentUrl('http://100.128.0.1')).not.toBeNull();
    });

    it('does not fetch rejected targets', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const original = createMockResult({ url: 'http://127.0.0.1/private', content: 'snippet' });
      await expect(fetchWebpageContent([original])).resolves.toEqual([original]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects unsafe redirects and oversized responses', async () => {
      const original = createMockResult({ url: 'https://example.com/page', content: 'snippet' });
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } })
        )
        .mockResolvedValueOnce(
          new Response('ignored', {
            status: 200,
            headers: { 'content-type': 'text/html', 'content-length': '1048577' },
          })
        );
      await expect(fetchWebpageContent([original])).resolves.toEqual([original]);
      await expect(fetchWebpageContent([original])).resolves.toEqual([original]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('extracts bounded text content from valid HTML', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<html><body><h1>Useful result</h1></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      );
      const result = createMockResult({ url: 'https://example.com/page', content: 'snippet' });
      const [enriched] = await fetchWebpageContent([result]);
      expect(enriched?.content).toContain('Useful result');
    });

    it('handles redirects, response rejection, unsupported content, empty bodies, and failures', async () => {
      const original = createMockResult({ url: 'https://example.com/page', content: 'snippet' });
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 302 }));
      await expect(fetchWebpageContent([original])).resolves.toEqual([original]);

      fetchSpy.mockResolvedValueOnce(new Response('no', { status: 500 }));
      await expect(fetchWebpageContent([original])).resolves.toEqual([original]);

      fetchSpy.mockResolvedValueOnce(
        new Response('binary', { headers: { 'content-type': 'application/octet-stream' } })
      );
      await expect(fetchWebpageContent([original])).resolves.toEqual([original]);

      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
      await expect(fetchWebpageContent([original])).resolves.toEqual([
        { ...original, content: 'snippet' },
      ]);

      fetchSpy.mockRejectedValueOnce(new Error('offline'));
      await expect(fetchWebpageContent([original])).resolves.toEqual([original]);
      await expect(fetchWebpageContent([])).resolves.toEqual([]);
      await expect(
        fetchWebpageContent([{ title: 'missing URL', url: undefined } as unknown as SearchResult])
      ).resolves.toEqual([{ title: 'missing URL', url: undefined }]);
    });

    it('follows safe redirects and stops at the redirect limit', async () => {
      const original = createMockResult({ url: 'https://example.com/start' });
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/next' } }))
        .mockResolvedValueOnce(
          new Response('<p>redirected</p>', { headers: { 'content-type': 'text/plain' } })
        );
      expect((await fetchWebpageContent([original]))[0]?.content).toContain('redirected');

      fetchSpy.mockResolvedValue(
        new Response(null, { status: 302, headers: { location: '/again' } })
      );
      await expect(fetchWebpageContent([original])).resolves.toEqual([original]);
    });

    it('cancels streamed bodies that exceed the byte ceiling', async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(1024 * 1024 + 1));
          controller.close();
        },
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(body, { headers: { 'content-type': 'application/xhtml+xml' } })
      );
      const original = createMockResult({ url: 'https://example.com/large' });
      await expect(fetchWebpageContent([original])).resolves.toEqual([original]);
    });
  });

  describe('analyzeResults', () => {
    it('should analyze result metadata', () => {
      const results = [
        createMockResult({ title: 'JavaScript Guide', content: 'Learn JavaScript programming' }),
        createMockResult({ title: 'Python Tutorial', content: 'Python programming basics' }),
      ];
      const analysis = analyzeResults(results, 'programming');
      expect(analysis.totalResults).toBe(2);
      expect(analysis.avgTitleLength).toBeGreaterThan(0);
    });

    it('should extract top keywords', () => {
      const results = [
        createMockResult({
          title: 'JavaScript Tutorial',
          content: 'Learn programming with JavaScript',
        }),
        createMockResult({ title: 'Python Guide', content: 'Programming in Python language' }),
      ];
      const analysis = analyzeResults(results, 'test');
      expect(analysis.topKeywords.length).toBeGreaterThan(0);
    });

    it('should analyze sentiment', () => {
      const positiveResults = [
        createMockResult({
          title: 'Best Tutorial',
          content: 'Excellent guide with helpful solutions',
        }),
      ];
      const analysis = analyzeResults(positiveResults, 'test');
      expect(analysis.sentiment.positive).toBeGreaterThanOrEqual(0);
    });

    it('covers negative, neutral, missing, malformed, image, date, score, and engine fallbacks', () => {
      const analysis = analyzeResults(
        [
          createMockResult({
            title: 'Broken error',
            content: 'problem failure',
            url: 'invalid',
            engine: undefined,
            engines: ['bing'],
            thumbnail: 'image',
            publishedDate: '2026-01-01',
          }),
          createMockResult({
            title: undefined,
            content: undefined,
            url: undefined,
            engine: undefined,
            engines: undefined,
            score: undefined,
          }),
        ],
        'failure'
      );
      expect(analysis.sentiment).toEqual({ positive: 0, negative: 1, neutral: 1 });
      expect(analysis.engines).toMatchObject({ bing: 1, unknown: 1 });
      expect(analyzeResults([], 'empty')).toMatchObject({
        avgTitleLength: 0,
        avgContentLength: 0,
      });
      expect(
        analyzeResults(
          [
            createMockResult({ url: 'https://a.example/1' }),
            createMockResult({ url: 'https://a.example/2' }),
            createMockResult({ url: 'https://b.example/1' }),
          ],
          'none'
        ).topDomains?.[0]
      ).toEqual({ domain: 'a.example', count: 2 });
    });
  });
});
