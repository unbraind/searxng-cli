import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decode as decodeToon } from '@toon-format/toon';
import {
  formatJsonOutput,
  formatJsonlOutput,
  formatCsvOutput,
  formatRssOutput,
  formatMarkdownOutput,
  formatRawOutput,
  formatYamlOutput,
  formatTableOutput,
  formatTextOutput,
  formatSimpleOutput,
  formatQuickOutput,
  formatSummaryOutput,
  formatCitationOutput,
  formatResult,
} from '@/formatters/index';
import {
  formatToonOutput,
  formatToonOutputFull,
  formatXmlOutput,
  formatHtmlReportOutput,
  normalizeNumber,
} from '@/formatters-advanced/index';
import { createTestSearchOptions as createMockOptions } from '../helpers/search-options';
import type { SearchResponse, SearchResult } from '@/types/index';

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
  describe('formatResult', () => {
    it('formats fallback fields, metadata, and transformed content', () => {
      const output = formatResult(
        {
          title: '&lt;b&gt;Result&lt;/b&gt;',
          url: '',
          link: 'https://example.com/fallback',
          engines: ['one', 'two', 'three', 'four'],
          score: 0.75,
          publishedDate: '2026-07-21T00:00:00.000Z',
          abstract: '<p>Result content</p>',
        },
        0,
        createMockOptions({ query: 'result', unescape: true, autoformat: true, score: true })
      );
      expect(output).toContain('Result');
      expect(output).toContain('[one,two,three...]');
      expect(output).toContain('score:0.75');
      expect(output).toContain('Result content');
    });

    it('supports direct engine, nonnumeric score, raw text, and empty metadata', () => {
      expect(
        formatResult(
          {
            title: undefined,
            url: undefined,
            engine: 'direct',
            score: 'high' as unknown as number,
            snippet: 'raw snippet',
          } as unknown as SearchResult,
          1,
          createMockOptions({ query: '', unescape: false, autoformat: false, score: true })
        )
      ).toContain('score:high');
      expect(
        formatResult(
          { title: 'Plain', url: 'https://example.com' },
          0,
          createMockOptions({ score: false, unescape: false, autoformat: false })
        )
      ).not.toContain('score:');
      expect(
        formatResult(
          { title: 'Engines', url: 'https://example.com', engines: ['one', 'two'] },
          0,
          createMockOptions({ score: false })
        )
      ).toContain('[one,two]');
    });
  });

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
      const parsed = JSON.parse(output) as { answers: { answer: string }[] };
      expect(parsed.answers[0]?.answer).toBe('The answer is 42');
    });

    it('should include answers as objects when present', () => {
      const data = createMockResponse({
        answers: [{ answer: 'Computed answer', url: 'https://example.com' }],
      });
      const options = createMockOptions();
      const output = formatJsonOutput(data, options);
      const parsed = JSON.parse(output) as {
        answers: { answer: string; url?: string | null }[];
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

    it('filters against content and URL and normalizes optional result fields', () => {
      const data = createMockResponse({
        _cached: true,
        _cacheAge: 10,
        timing: '5ms',
        corrections: ['corrected'],
        unresponsive_engines: ['timeout'],
        results: [
          {
            title: undefined,
            url: undefined,
            link: 'https://content.example',
            content: 'needle content',
            engines: ['fallback'],
            img_src: 'image.png',
          } as unknown as SearchResult,
          { title: 'URL only', url: 'https://needle.example' },
          { title: 'Abstract mapping', url: 'https://abstract.example', abstract: 'abstract' },
          { title: undefined, url: undefined } as unknown as SearchResult,
        ],
      });
      const contentMatch = JSON.parse(
        formatJsonOutput(data, createMockOptions({ filter: 'needle content', limit: 0 }))
      ) as { results: SearchResult[]; cached: boolean };
      expect(contentMatch.results[0]).toMatchObject({
        url: 'https://content.example',
        content: 'needle content',
        engine: 'fallback',
        thumbnail: 'image.png',
      });
      expect(contentMatch.cached).toBe(true);
      expect(
        JSON.parse(formatJsonOutput(data, createMockOptions({ filter: 'needle.example' }))).results
      ).toHaveLength(1);
      expect(
        JSON.parse(
          formatJsonOutput(createMockResponse({ results: undefined }), createMockOptions())
        ).results
      ).toEqual([]);
      const absentOptionals = JSON.parse(
        formatJsonOutput(
          createMockResponse({
            number_of_results: undefined,
            answers: [
              { answer: undefined, url: undefined } as unknown as { answer: string; url?: string },
            ],
            suggestions: undefined,
            corrections: undefined,
            unresponsive_engines: undefined,
            results: [{ title: undefined, url: undefined } as unknown as SearchResult],
          }),
          createMockOptions({ searxngParams: undefined })
        )
      ) as { results: SearchResult[]; answers: { answer: string; url: null }[] };
      expect(absentOptionals.results[0]).toMatchObject({ url: '', content: '', engine: null });
      expect(absentOptionals.answers[0]).toEqual({ answer: '', url: null });
      expect(
        JSON.parse(
          formatJsonOutput(
            createMockResponse({ answers: undefined, results: undefined }),
            createMockOptions()
          )
        )
      ).toMatchObject({ answers: [], results: [] });
    });
  });

  describe('formatJsonlOutput', () => {
    it('emits sequential JSON records with fallbacks and unlimited mode', () => {
      const output = formatJsonlOutput(
        createMockResponse({
          _cached: true,
          _cacheAge: 5,
          results: [
            {
              title: undefined,
              url: undefined,
              link: 'https://example.com',
              abstract: 'abstract',
              engines: ['engine'],
              img_src: 'thumb',
            } as unknown as SearchResult,
            { title: undefined, url: undefined } as unknown as SearchResult,
          ],
        }),
        createMockOptions({ limit: 0 })
      );
      expect(JSON.parse(output.split('\n')[0] ?? '')).toMatchObject({
        index: 1,
        url: 'https://example.com',
        content: 'abstract',
        engine: 'engine',
        thumbnail: 'thumb',
        cached: true,
      });
      expect(JSON.parse(output.split('\n')[1] ?? '')).toMatchObject({
        title: '',
        url: '',
        content: '',
        engine: null,
      });
      expect(
        formatJsonlOutput(createMockResponse({ results: undefined }), createMockOptions())
      ).toBe('');
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

    it('should support unlimited missing results and fields', () => {
      expect(
        formatSimpleOutput(
          createMockResponse({
            results: [{ title: undefined, url: undefined } as unknown as SearchResult],
          }),
          createMockOptions({ limit: 0 })
        )
      ).toBe('1. \n   ');
      expect(
        formatSimpleOutput(createMockResponse({ results: undefined }), createMockOptions())
      ).toBe('');
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

    it('normalizes missing values, newlines, links, engine lists, and unlimited output', () => {
      const output = formatCsvOutput(
        createMockResponse({
          results: [
            {
              title: ' line\nvalue ',
              url: undefined,
              link: 'https://example.com',
              engines: ['fallback'],
              abstract: 'abstract',
            } as unknown as SearchResult,
            { title: undefined, url: undefined } as unknown as SearchResult,
          ],
        }),
        createMockOptions({ limit: 0 })
      );
      expect(output).toContain('"line value"');
      expect(output).toContain('"fallback"');
      expect(output).toContain('2,"","","","",""');
      expect(formatCsvOutput(createMockResponse({ results: undefined }), createMockOptions())).toBe(
        'i,title,url,engine,score,text'
      );
    });
  });

  describe('formatRssOutput', () => {
    it('renders escaped RSS 2.0 items, optional dates, limits, and empty results', () => {
      const data = createMockResponse({
        results: [
          {
            title: `A & "B" 'C'`,
            url: 'https://example.com/?a=1&b=2',
            content: '<b>Useful & safe</b>',
            publishedDate: '2026-07-31T10:00:00.000Z',
          },
          {
            title: 'Second',
            url: '',
            link: 'https://example.com/second',
            publishedDate: 'not-a-date',
          },
        ],
      });
      const output = formatRssOutput(data, createMockOptions({ query: 'A & B', limit: 1 }));
      expect(output).toContain('<rss version="2.0">');
      expect(output).toContain('<title>A &amp; B</title>');
      expect(output).toContain('<title>A &amp; &quot;B&quot; &apos;C&apos;</title>');
      expect(output).toContain('<pubDate>');
      expect(output).not.toContain('<title>Second</title>');

      const unlimited = formatRssOutput(
        {
          query: 'fallbacks',
          results: [
            {
              title: 'Abstract',
              url: undefined,
              link: 'https://example.com/abstract',
              abstract: 'A',
            },
            { title: 'Snippet', url: 'https://example.com/snippet', snippet: 'S' },
            { title: undefined, url: undefined, link: undefined },
          ],
        } as unknown as SearchResponse,
        createMockOptions({ limit: 0 })
      );
      expect(unlimited).toContain('<link>https://example.com/abstract</link>');
      expect(unlimited).toContain('<description>A</description>');
      expect(unlimited).toContain('<description>S</description>');
      expect(unlimited).toContain('<title></title>');
      expect(unlimited).not.toContain('<pubDate>');
      const normalized = formatRssOutput(data, createMockOptions({ query: 'fallbacks', limit: 0 }));
      expect(normalized).toContain('<link>https://example.com/second</link>');
      expect(normalized.match(/<pubDate>/g)).toHaveLength(1);
      expect(
        formatRssOutput({ query: 'empty' } as unknown as SearchResponse, createMockOptions())
      ).toContain('<channel>');
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

    it('supports unlimited missing-valued and empty results', () => {
      expect(
        formatMarkdownOutput(
          createMockResponse({
            results: [{ title: undefined, url: undefined } as unknown as SearchResult],
          }),
          createMockOptions({ limit: 0 })
        )
      ).toContain('[No title]()');
      expect(
        formatMarkdownOutput(createMockResponse({ results: undefined }), createMockOptions())
      ).toContain('> 0 results');
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

    it('escapes scalar types and supports object answers and result fallbacks', () => {
      const output = formatYamlOutput(
        createMockResponse({
          _cached: true,
          timing: "line\n'quoted'",
          results: [
            {
              title: undefined,
              url: undefined,
              link: 'https://example.com',
              snippet: 'snippet',
              engines: ['engine'],
              score: 0,
            } as unknown as SearchResult,
            { title: undefined, url: undefined } as unknown as SearchResult,
          ],
          answers: [{ answer: undefined, url: undefined } as unknown as { answer: string }],
          suggestions: undefined,
        }),
        createMockOptions({ limit: 0 })
      );
      expect(output).toContain("timing: 'line\\n''quoted''' ".trim());
      expect(output).toContain('score: 0');
      expect(output).toContain('url: null');
      expect(output).toContain('engine: null');
      expect(
        formatYamlOutput(createMockResponse({ results: undefined }), createMockOptions())
      ).toContain('returnedCount: 0');
      expect(
        formatYamlOutput(
          createMockResponse({ results: undefined, answers: undefined, suggestions: undefined }),
          createMockOptions()
        )
      ).toContain('answers:\nsuggestions:');
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

    it('supports unlimited fallback and missing table fields', () => {
      const output = formatTableOutput(
        createMockResponse({
          results: [
            { title: undefined, url: '', engines: ['fallback'] } as unknown as SearchResult,
            { title: '', url: '' },
          ],
        }),
        createMockOptions({ limit: 0 })
      );
      expect(output).toContain('fallback');
      expect(output).toContain('-');
      expect(
        formatTableOutput(createMockResponse({ results: undefined }), createMockOptions())
      ).toContain('0 results');
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

    it('supports unlimited missing and empty text results', () => {
      expect(
        formatTextOutput(
          createMockResponse({
            results: [{ title: undefined, url: undefined } as unknown as SearchResult],
          }),
          createMockOptions({ limit: 0 })
        )
      ).toContain('1. ');
      expect(
        formatTextOutput(createMockResponse({ results: undefined }), createMockOptions())
      ).toContain('0 results');
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

    it('supports unlimited missing and empty quick results', () => {
      expect(
        formatQuickOutput(
          createMockResponse({
            results: [{ title: undefined, url: undefined } as unknown as SearchResult],
          }),
          createMockOptions({ limit: 0 })
        )
      ).toContain('1. ');
      expect(
        formatQuickOutput(createMockResponse({ results: undefined }), createMockOptions())
      ).toContain('(0)');
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

    it('supports scoreless, unlimited, missing, and empty summary results', () => {
      expect(
        formatSummaryOutput(
          createMockResponse({
            results: [{ title: undefined, url: undefined, score: 0 } as unknown as SearchResult],
          }),
          createMockOptions({ limit: 0 })
        )
      ).not.toContain('(0.0)');
      expect(
        formatSummaryOutput(createMockResponse({ results: undefined }), createMockOptions())
      ).toContain('0 results');
    });
  });

  describe('formatCitationOutput', () => {
    it('formats raw and normalized citations with fallbacks', () => {
      const data = createMockResponse({
        results: [
          {
            title: undefined,
            url: undefined,
            link: 'https://example.com',
            abstract: '<b>abstract</b>',
          } as unknown as SearchResult,
          { title: 'No content', url: 'invalid' },
          { title: 'Snippet', url: undefined, snippet: 'snippet' } as unknown as SearchResult,
          { title: 'Empty', url: undefined } as unknown as SearchResult,
        ],
      });
      expect(formatCitationOutput(data, createMockOptions({ limit: 0 }))).toContain(
        'Content: abstract'
      );
      expect(
        formatCitationOutput(data, createMockOptions({ rawContent: true, limit: 0 }))
      ).toContain('<b>abstract</b>');
      expect(
        formatCitationOutput(createMockResponse({ results: undefined }), createMockOptions())
      ).toBe('');
    });
  });
});

describe('Advanced Formatters Module', () => {
  describe('formatToonOutput', () => {
    it('normalizes finite numbers and rejects non-finite values', () => {
      expect(normalizeNumber(-0)).toBe(0);
      expect(normalizeNumber(1.26)).toBe(1.3);
      expect(normalizeNumber(Number.NaN)).toBeUndefined();
      expect(normalizeNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
    });

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
      expect(output).toContain('results: []');
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
      expect(parsed.tv).toBe('4.1');
    });

    it('preserves hash-leading strings under the TOON v4 comment contract', () => {
      const data = createMockResponse({
        results: [{ title: '#heading', url: 'https://example.com/hash' }],
      });
      const output = formatToonOutput(data, createMockOptions());
      const parsed = decodeToon(output) as { results?: { title?: string }[] };
      expect(output).toContain('"#heading"');
      expect(parsed.results?.[0]?.title).toBe('#heading');
    });

    it('should represent the complete optional SearXNG response surface', () => {
      const data = createMockResponse({
        _cacheAge: 2500,
        timing: '12ms',
        corrections: ['corrected'],
        infoboxes: [{ infobox: 'Info', content: 'Details' }],
        unresponsive_engines: ['engine: timeout'],
        results: [
          {
            title: '<b>Agent result</b>',
            url: 'https://example.com/a/very/long/path/that/is/shortened',
            abstract: 'Abstract fallback',
            engines: ['fallback-engine'],
            score: -0,
            publishedDate: '2026-07-21T12:00:00.000Z',
          },
          {
            title: 'Invalid URL',
            url: 'not a valid url',
            snippet: 'Snippet fallback',
            score: Number.NaN,
          },
          { title: 'Root path', url: 'https://second.example/' },
        ],
        answers: [{ answer: 'Object answer' }, {} as { answer: string }],
      });
      const output = formatToonOutputFull(
        data,
        createMockOptions({
          limit: 0,
          engines: 'brave',
          category: 'general',
          timeRange: 'week',
          verbose: true,
        })
      );
      const parsed = decodeToon(output) as Record<string, unknown>;
      expect(parsed).toMatchObject({
        ca: '3s',
        lat: '12ms',
        e: 'brave',
        cat: 'general',
        t: 'week',
        corrections: ['corrected'],
        unresponsive_engines: ['engine: timeout'],
      });
      expect(parsed.infobox).toEqual({ title: 'Info', content: 'Details' });

      const agentOutput = formatToonOutput(data, createMockOptions({ agent: true, limit: 0 }));
      expect(agentOutput).toContain('example.com/a/very/long/path/that');
      expect(agentOutput).toContain('not a valid url');
      expect(agentOutput).not.toContain('infobox');
    });

    it('omits empty optional metadata', () => {
      const output = formatToonOutput(
        createMockResponse({
          results: [{ title: '', url: '', content: '', engines: [], score: undefined }],
          answers: [],
          suggestions: [],
          corrections: [],
          infoboxes: [
            { infobox: 1, content: 2 } as unknown as { infobox: string; content: string },
          ],
          number_of_results: 0,
          unresponsive_engines: [],
        }),
        createMockOptions({ limit: 1, verbose: true })
      );
      const parsed = decodeToon(output) as { results: Record<string, unknown>[] };
      expect(parsed.results[0]).toEqual({ i: 1, title: '', url: '' });
      expect(
        decodeToon(
          formatToonOutput(
            createMockResponse({
              results: undefined,
              infoboxes: [undefined] as unknown as SearchResponse['infoboxes'],
            }),
            createMockOptions()
          )
        )
      ).toMatchObject({ n: 0, results: [] });
      const missingValues = formatToonOutput(
        createMockResponse({
          results: [{ title: undefined, url: undefined } as unknown as SearchResult],
        }),
        createMockOptions({ agent: true })
      );
      expect(
        (decodeToon(missingValues) as unknown as { results: SearchResult[] }).results[0]
      ).toMatchObject({
        title: '',
        url: '',
      });
      const missingNonAgentValues = formatToonOutput(
        createMockResponse({
          results: [{ title: 'Missing URL', url: undefined } as unknown as SearchResult],
        }),
        createMockOptions()
      );
      expect(
        (decodeToon(missingNonAgentValues) as unknown as { results: SearchResult[] }).results[0]
      ).toMatchObject({ url: '' });
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

    it('should support unlimited empty and fallback-valued XML results', () => {
      const output = formatXmlOutput(
        createMockResponse({
          results: [
            {
              title: '',
              link: 'https://example.com/link',
              abstract: 'abstract',
              engines: ['fallback'],
            } as unknown as SearchResult,
            { snippet: 'snippet' } as unknown as SearchResult,
          ],
        }),
        createMockOptions({ query: '<query & "quoted">', limit: 0 })
      );
      expect(output).toContain('query="&lt;query &amp; &quot;quoted&quot;&gt;"');
      expect(output).toContain('<url>https://example.com/link</url>');
      expect(output).toContain('<engine>fallback</engine>');
      expect(output).toContain('<score></score>');
      expect(
        formatXmlOutput(createMockResponse({ results: undefined }), createMockOptions())
      ).toContain('<results>\n</results>');
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

    it('should support unlimited results without optional content', () => {
      const output = formatHtmlReportOutput(
        createMockResponse({
          results: [{ title: undefined, url: undefined } as unknown as SearchResult],
        }),
        createMockOptions({ query: '<unsafe>', limit: 0 })
      );
      expect(output).toContain('&lt;unsafe&gt;');
      expect(output).not.toContain('class="s"');
      expect(
        formatHtmlReportOutput(createMockResponse({ results: undefined }), createMockOptions())
      ).toContain('0 results');
    });
  });
});
