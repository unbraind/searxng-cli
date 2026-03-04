import { describe, it, expect, beforeEach } from 'vitest';
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
} from '@/search/index';
import type { SearchResult, SearchOptions } from '@/types/index';

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
  });
});
