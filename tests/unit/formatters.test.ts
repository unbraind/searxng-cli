import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decode as decodeToon } from '@toon-format/toon';
import {
  formatJsonOutput,
  formatCsvOutput,
  formatMarkdownOutput,
  formatRawOutput,
  formatYamlOutput,
  formatTableOutput,
  formatTextOutput,
  formatSimpleOutput,
  formatQuickOutput,
  formatSummaryOutput,
} from '@/formatters/index';
import {
  formatToonOutput,
  formatXmlOutput,
  formatHtmlReportOutput,
} from '@/formatters-advanced/index';
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

describe('Formatters Module', () => {
  describe('formatJsonOutput', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      vi.clearAllMocks();
    });

    it('should return valid JSON for empty data', () => {
      const data = createMockResponse({ results: [] });
      const options = createMockOptions();
      const output = formatJsonOutput(data, options);
      const parsed = JSON.parse(output) as {
        resultCount: number;
        results: unknown[];
        source: string;
        generatedAt: string;
      };
      expect(parsed.resultCount).toBe(0);
      expect(parsed.results).toEqual([]);
      expect(parsed.source).toContain('http://');
      expect(new Date(parsed.generatedAt).toString()).not.toBe('Invalid Date');
    });

    it('should include query and counts', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatJsonOutput(data, options);
      const parsed = JSON.parse(output) as {
        query: string;
        resultCount: number;
        returnedCount: number;
      };
      expect(parsed.query).toBe('test query');
      expect(parsed.resultCount).toBe(2);
      expect(parsed.returnedCount).toBe(2);
    });

    it('should include answers when present', () => {
      const data = createMockResponse({ answers: ['The answer is 42'] });
      const options = createMockOptions();
      const output = formatJsonOutput(data, options);
      const parsed = JSON.parse(output) as { answers: Array<{ answer: string }> };
      expect(parsed.answers[0]?.answer).toBe('The answer is 42');
    });

    it('should include answers as objects when present', () => {
      const data = createMockResponse({
        answers: [{ answer: 'Computed answer', url: 'https://example.com' }],
      });
      const options = createMockOptions();
      const output = formatJsonOutput(data, options);
      const parsed = JSON.parse(output) as {
        answers: Array<{ answer: string; url?: string | null }>;
      };
      expect(parsed.answers[0]?.answer).toBe('Computed answer');
      expect(parsed.answers[0]?.url).toBe('https://example.com');
    });

    it('should include suggestions when present', () => {
      const data = createMockResponse({
        suggestions: ['suggestion 1', 'suggestion 2', 'suggestion 3'],
      });
      const options = createMockOptions();
      const output = formatJsonOutput(data, options);
      const parsed = JSON.parse(output) as { suggestions: string[] };
      expect(parsed.suggestions).toContain('suggestion 1');
    });

    it('should apply filter when set', () => {
      const data = createMockResponse({
        results: [
          { title: 'Match result', url: 'https://example.com/match', content: 'matching content' },
          { title: 'Other result', url: 'https://example.com/other', content: 'other content' },
        ],
      });
      const options = createMockOptions({ filter: 'match' });
      const output = formatJsonOutput(data, options);
      expect(output).toContain('Match result');
      expect(output).not.toContain('Other result');
    });

    it('should respect limit option', () => {
      const data = createMockResponse();
      const options = createMockOptions({ limit: 1 });
      const output = formatJsonOutput(data, options);
      expect(output).toContain('Test Result 1');
    });
  });

  describe('formatSimpleOutput', () => {
    it('should return each result as simple text lines', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatSimpleOutput(data, options);
      expect(output).toContain('1. Test Result 1');
      expect(output).toContain('https://example.com/1');
    });

    it('should truncate long titles', () => {
      const data = createMockResponse({
        results: [{ title: 'A'.repeat(100), url: 'https://example.com' }],
      });
      const options = createMockOptions();
      const output = formatSimpleOutput(data, options);
      const firstLine = output.split('\n')[0] ?? '';
      expect(firstLine.length).toBeLessThan(80);
    });

    it('should respect limit option', () => {
      const data = createMockResponse();
      const options = createMockOptions({ limit: 1 });
      const output = formatSimpleOutput(data, options);
      const lines = output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      expect(lines.length).toBe(2);
    });

    it('should handle empty results', () => {
      const data = createMockResponse({ results: [] });
      const options = createMockOptions();
      const output = formatSimpleOutput(data, options);
      expect(output).toBe('');
    });
  });

  describe('formatCsvOutput', () => {
    it('should format results as CSV with header', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatCsvOutput(data, options);
      expect(output).toContain('i,title,url,engine,score,text');
      expect(output).toContain('1,"Test Result 1"');
    });

    it('should escape quotes in CSV', () => {
      const data = createMockResponse({
        results: [{ title: 'Test "quoted" result', url: 'https://example.com' }],
      });
      const options = createMockOptions();
      const output = formatCsvOutput(data, options);
      expect(output).toContain('""quoted""');
    });

    it('should respect limit option', () => {
      const data = createMockResponse();
      const options = createMockOptions({ limit: 1 });
      const output = formatCsvOutput(data, options);
      const lines = output.split('\n').filter((l) => l.trim());
      expect(lines.length).toBe(2);
    });
  });

  describe('formatMarkdownOutput', () => {
    it('should format results as Markdown', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatMarkdownOutput(data, options);
      expect(output).toContain('# test query');
      expect(output).toContain('[Test Result 1]');
    });

    it('should include result count', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatMarkdownOutput(data, options);
      expect(output).toContain('> 2 results');
    });
  });

  describe('formatRawOutput', () => {
    it('should output raw JSON', () => {
      const data = createMockResponse();
      const output = formatRawOutput(data);
      const parsed = JSON.parse(output);
      expect(parsed.query).toBe('test query');
      expect(parsed.results.length).toBe(2);
    });
  });

  describe('formatYamlOutput', () => {
    it('should format results as YAML', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatYamlOutput(data, options);
      expect(output).toContain("query: 'test query'");
      expect(output).toContain("source: 'http://");
      expect(output).toContain("generatedAt: '");
      expect(output).toContain('results:');
      expect(output).toContain('- i: 1');
      expect(output).toContain('answers:');
      expect(output).toContain('suggestions:');
    });
  });

  describe('formatTableOutput', () => {
    it('should format results as a table', () => {
      const data = createMockResponse();
      const options = createMockOptions({ score: true });
      const output = formatTableOutput(data, options);
      expect(output).toContain('Test Result 1');
      expect(output).toContain('google');
      expect(output).toContain('0.9');
    });
  });

  describe('formatTextOutput', () => {
    it('should format results as plain text', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatTextOutput(data, options);
      expect(output).toContain('test query (2 results)');
      expect(output).toContain('1. Test Result 1');
    });
  });

  describe('formatQuickOutput', () => {
    it('should format minimal output', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatQuickOutput(data, options);
      expect(output).toContain('test query');
      expect(output).toContain('(2)');
    });
  });

  describe('formatSummaryOutput', () => {
    it('should format summary output', () => {
      const data = createMockResponse();
      const options = createMockOptions({ score: true });
      const output = formatSummaryOutput(data, options);
      expect(output).toContain('test query');
      expect(output).toContain('2 results');
    });
  });
});

describe('Advanced Formatters Module', () => {
  describe('formatToonOutput', () => {
    it('should output valid TOON format', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatToonOutput(data, options);
      expect(output).toContain('q: test query');
      expect(output).toContain('ts: ');
      expect(output).toContain('n: 2');
      expect(output).toContain('results[2]');
      const parsed = decodeToon(output) as { src?: string };
      expect(parsed.src).toContain('http://');
    });

    it('should include query in output', () => {
      const data = createMockResponse();
      const options = createMockOptions({ query: 'javascript tutorial' });
      const output = formatToonOutput(data, options);
      expect(output).toContain('q: javascript tutorial');
    });

    it('should include cached flag', () => {
      const data = createMockResponse({ _cached: true });
      const options = createMockOptions();
      const output = formatToonOutput(data, options);
      expect(output).toContain('c: 1');
    });

    it('should include suggestions when present', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatToonOutput(data, options);
      expect(output).toContain('suggestions[');
    });

    it('should include answers when present', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatToonOutput(data, options);
      expect(output).toContain('answers[');
    });

    it('should handle empty results', () => {
      const data = createMockResponse({ results: [] });
      const options = createMockOptions();
      const output = formatToonOutput(data, options);
      expect(output).toContain('n: 0');
      expect(output).toContain('results[0]');
    });

    it('should include result URLs', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatToonOutput(data, options);
      expect(output).toContain('https://example.com/1');
    });

    it('should include TOON spec version', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatToonOutput(data, options);
      const parsed = decodeToon(output) as { tv?: string };
      expect(parsed.tv).toBe('3.0');
    });
  });

  describe('formatXmlOutput', () => {
    it('should output valid XML format', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatXmlOutput(data, options);
      expect(output).toContain('<?xml version="1.0"');
      expect(output).toContain('<search schema="1.0" query="test query"');
      expect(output).toContain('source="http://');
      expect(output).toContain('generatedAt="');
      expect(output).toContain('<result index="1">');
      expect(output).toContain('<title>Test Result 1</title>');
      expect(output).toContain('<url>https://example.com/1</url>');
    });

    it('should escape special characters in XML', () => {
      const data = createMockResponse({
        results: [{ title: 'Test & "quotes"', url: 'https://example.com' }],
      });
      const options = createMockOptions();
      const output = formatXmlOutput(data, options);
      expect(output).toContain('&amp;');
      expect(output).toContain('&quot;');
    });

    it('should close with </search>', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatXmlOutput(data, options);
      expect(output).toContain('</search>');
    });
  });

  describe('formatHtmlReportOutput', () => {
    it('should output valid HTML', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatHtmlReportOutput(data, options);
      expect(output).toContain('<!DOCTYPE html>');
      expect(output).toContain('<html>');
      expect(output).toContain('<title>test query</title>');
    });

    it('should include results as divs', () => {
      const data = createMockResponse();
      const options = createMockOptions();
      const output = formatHtmlReportOutput(data, options);
      expect(output).toContain('class="r"');
      expect(output).toContain('class="u"');
    });
  });
});
