import * as fs from 'fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as childProcess from 'child_process';
import {
  parseArgs,
  createDefaultOptions,
  showVersion,
  showHelp,
  openInBrowser,
  showSpinner,
} from '@/cli/index';
import * as storage from '@/storage/index';
import type { SearchOptions } from '@/types/index';

const createMockOptions = (overrides: Partial<SearchOptions> = {}): SearchOptions => ({
  query: '',
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
  strict: false,
  ...overrides,
});

describe('CLI Module', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('createDefaultOptions', () => {
    it('should return default SearchOptions', () => {
      const options = createDefaultOptions();

      expect(['toon', 'json']).toContain(options.format);
      expect(options.limit).toBeGreaterThanOrEqual(10);
      expect(options.page).toBe(1);
      expect(options.safeSearch).toBe(0);
      expect(options.dedup).toBe(true);
      expect(options.verbose).toBe(false);
    });

    it('should set pipe mode based on TTY', () => {
      const options = createDefaultOptions();
      expect(typeof options.pipe).toBe('boolean');
    });

    it('should load default SearXNG passthrough params from settings', () => {
      const loadSettingsSpy = vi.spyOn(storage, 'loadSettings').mockReturnValue({
        ...storage.getDefaultSettings(),
        defaultSearxngParams: { theme: 'simple' },
      });
      const options = createDefaultOptions();
      expect(options.searxngParams).toEqual({ theme: 'simple' });
      loadSettingsSpy.mockRestore();
    });
  });

  describe('parseArgs', () => {
    describe('query parsing', () => {
      it('should parse simple query', () => {
        const options = parseArgs(['search', 'query']);
        expect(options.query).toBe('search query');
      });

      it('should parse single word query', () => {
        const options = parseArgs(['search']);
        expect(options.query).toBe('search');
      });

      it('should handle empty args', () => {
        const options = parseArgs([]);
        expect(options.query).toBe('');
      });

      it('should stop option parsing after --', () => {
        const options = parseArgs(['--', '--nonexistent-flag']);
        expect(options.query).toBe('--nonexistent-flag');
      });
    });

    describe('unknown option handling', () => {
      it('should fail on unknown option', () => {
        expect(() => parseArgs(['--nonexistent-flag'])).toThrow(/process\.exit/);
      });
    });

    describe('format option', () => {
      it('should parse --format option', () => {
        const options = parseArgs(['--format', 'json', 'query']);
        expect(options.format).toBe('json');
      });

      it('should fail when --format value is missing', () => {
        expect(() => parseArgs(['--format', '--json', 'query'])).toThrow(/process\.exit/);
      });

      it('should fail when --format= value is empty', () => {
        expect(() => parseArgs(['--format=', 'query'])).toThrow(/process\.exit/);
      });

      it('should parse -f short option', () => {
        const options = parseArgs(['-f', 'csv', 'query']);
        expect(options.format).toBe('csv');
      });

      it('should parse --format= notation', () => {
        const options = parseArgs(['--format=yaml', 'query']);
        expect(options.format).toBe('yaml');
      });

      it('should parse --format ndjson as jsonl', () => {
        const options = parseArgs(['--format', 'ndjson', 'query']);
        expect(options.format).toBe('jsonl');
      });

      it('should parse --json option', () => {
        const options = parseArgs(['--json', 'query']);
        expect(options.format).toBe('json');
        expect(options.compact).toBe(true);
      });

      it('should parse --toon option', () => {
        const options = parseArgs(['--toon', 'query']);
        expect(options.format).toBe('toon');
      });

      it('should parse --text and --simple as distinct formats', () => {
        const textOptions = parseArgs(['--text', 'query']);
        const simpleOptions = parseArgs(['--simple', 'query']);
        expect(textOptions.format).toBe('text');
        expect(simpleOptions.format).toBe('simple');
      });

      it('should parse --ndjson shortcut option', () => {
        const options = parseArgs(['--ndjson', 'query']);
        expect(options.format).toBe('jsonl');
        expect(options.jsonl).toBe(true);
      });
    });

    describe('engines option', () => {
      it('should parse --engines option', () => {
        const options = parseArgs(['--engines', 'google,bing', 'query']);
        expect(options.engines).toBe('google,bing');
      });

      it('should parse -e short option', () => {
        const options = parseArgs(['-e', 'duckduckgo', 'query']);
        expect(options.engines).toBe('duckduckgo');
      });
    });

    describe('offline-first option', () => {
      it('should parse --offline-first', () => {
        const options = parseArgs(['--offline-first', 'query']);
        expect(options.offlineFirst).toBe(true);
      });

      it('should parse --cache-only alias', () => {
        const options = parseArgs(['--cache-only', 'query']);
        expect(options.offlineFirst).toBe(true);
      });

      it('should parse --request-json', () => {
        const options = parseArgs(['--request-json', 'query']);
        expect(options.requestJson).toBe(true);
      });
    });

    describe('strict option', () => {
      it('should parse --strict', () => {
        const options = parseArgs(['--strict', 'query']);
        expect(options.strict).toBe(true);
      });

      it('should parse --fail-on-empty alias', () => {
        const options = parseArgs(['--fail-on-empty', 'query']);
        expect(options.strict).toBe(true);
      });
    });

    describe('param passthrough option', () => {
      it('should parse repeatable --param values', () => {
        const options = parseArgs(['--param', 'theme=simple', '--param=image_proxy=true', 'query']);
        expect(options.searxngParams).toEqual({
          theme: 'simple',
          image_proxy: 'true',
        });
      });

      it('should fail on invalid --param value', () => {
        expect(() => parseArgs(['--param', 'invalid', 'query'])).toThrow(/process\.exit/);
      });

      it('should parse --params-json object', () => {
        const options = parseArgs([
          '--params-json',
          '{"theme":"simple","enabled_plugins":"Hash_plugin"}',
          'query',
        ]);
        expect(options.searxngParams).toEqual({
          theme: 'simple',
          enabled_plugins: 'Hash_plugin',
        });
      });

      it('should fail on invalid --params-json value', () => {
        expect(() => parseArgs(['--params-json', '[1,2,3]', 'query'])).toThrow(/process\.exit/);
      });

      it('should parse --params-file JSON object', () => {
        const tempFile = `/tmp/searxng-cli-params-${Date.now()}.json`;
        fs.writeFileSync(tempFile, '{"theme":"simple","language":"en-US"}');
        try {
          const options = parseArgs(['--params-file', tempFile, 'query']);
          expect(options.searxngParams).toEqual({
            theme: 'simple',
            language: 'en-US',
          });
        } finally {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
          }
        }
      });

      it('should parse dedicated --sx-* passthrough flags', () => {
        const options = parseArgs([
          '--sx-theme',
          'simple',
          '--sx-enabled-plugins',
          'Hash_plugin,Tracker_URL_remover',
          '--sx-disabled-plugins',
          'Hostnames_plugin',
          '--sx-enabled-engines',
          'google, bing',
          '--sx-disabled-engines',
          'duckduckgo',
          '--sx-enabled-categories',
          'general,news',
          '--sx-disabled-categories',
          'music',
          '--sx-image-proxy',
          'true',
          'query',
        ]);
        expect(options.searxngParams).toEqual({
          theme: 'simple',
          enabled_plugins: 'Hash_plugin,Tracker_URL_remover',
          disabled_plugins: 'Hostnames_plugin',
          enabled_engines: 'google,bing',
          disabled_engines: 'duckduckgo',
          enabled_categories: 'general,news',
          disabled_categories: 'music',
          image_proxy: 'true',
        });
      });

      it('should parse --sx alias key/value params', () => {
        const options = parseArgs(['--sx', 'theme=simple', '--sx-param=image_proxy=true', 'query']);
        expect(options.searxngParams).toEqual({
          theme: 'simple',
          image_proxy: 'true',
        });
      });

      it('should parse --sx-query URL-style params', () => {
        const options = parseArgs([
          '--sx-query',
          'theme=simple&enabled_plugins=Hash_plugin&image_proxy=true',
          'query',
        ]);
        expect(options.searxngParams).toEqual({
          theme: 'simple',
          enabled_plugins: 'Hash_plugin',
          image_proxy: 'true',
        });
      });

      it('should fail on invalid --sx-image-proxy value', () => {
        expect(() => parseArgs(['--sx-image-proxy', 'maybe', 'query'])).toThrow(/process\.exit/);
      });

      it('should fail on empty --sx-enabled-engines value', () => {
        expect(() => parseArgs(['--sx-enabled-engines', ' , ', 'query'])).toThrow(/process\.exit/);
      });

      it('should fail on invalid --sx alias value', () => {
        expect(() => parseArgs(['--sx', 'invalid', 'query'])).toThrow(/process\.exit/);
      });

      it('should fail on invalid --sx-query value', () => {
        expect(() => parseArgs(['--sx-query', '&&', 'query'])).toThrow(/process\.exit/);
      });
    });

    describe('limit option', () => {
      it('should parse --limit option', () => {
        const options = parseArgs(['--limit', '20', 'query']);
        expect(options.limit).toBe(20);
      });

      it('should parse -n short option', () => {
        const options = parseArgs(['-n', '5', 'query']);
        expect(options.limit).toBe(5);
      });

      it('should handle invalid limit', () => {
        const options = parseArgs(['--limit', 'invalid', 'query']);
        expect(options.limit).toBeGreaterThanOrEqual(10);
      });
    });

    describe('page option', () => {
      it('should parse --page option', () => {
        const options = parseArgs(['--page', '2', 'query']);
        expect(options.page).toBe(2);
      });

      it('should parse -p short option', () => {
        const options = parseArgs(['-p', '3', 'query']);
        expect(options.page).toBe(3);
      });
    });

    describe('language option', () => {
      it('should parse --lang option', () => {
        const options = parseArgs(['--lang', 'de', 'query']);
        expect(options.lang).toBe('de');
      });

      it('should parse -l short option', () => {
        const options = parseArgs(['-l', 'fr', 'query']);
        expect(options.lang).toBe('fr');
      });
    });

    describe('category option', () => {
      it('should parse --category option', () => {
        const options = parseArgs(['--category', 'images', 'query']);
        expect(options.category).toBe('images');
      });

      it('should parse -c short option', () => {
        const options = parseArgs(['-c', 'news', 'query']);
        expect(options.category).toBe('news');
      });
    });

    describe('time range option', () => {
      it('should parse --time option', () => {
        const options = parseArgs(['--time', 'day', 'query']);
        expect(options.timeRange).toBe('day');
      });

      it('should parse -t short option', () => {
        const options = parseArgs(['-t', 'week', 'query']);
        expect(options.timeRange).toBe('week');
      });
    });

    describe('safe search option', () => {
      it('should parse --safe option', () => {
        const options = parseArgs(['--safe', '1', 'query']);
        expect(options.safeSearch).toBe(1);
      });
    });

    describe('boolean flags', () => {
      it('should parse --verbose flag', () => {
        const options = parseArgs(['--verbose', 'query']);
        expect(options.verbose).toBe(true);
      });

      it('should parse -V short flag', () => {
        const options = parseArgs(['-V', 'query']);
        expect(options.verbose).toBe(true);
      });

      it('should parse --no-cache flag', () => {
        const options = parseArgs(['--no-cache', 'query']);
        expect(options.noCache).toBe(true);
      });

      it('should parse --silent flag', () => {
        const options = parseArgs(['--silent', 'query']);
        expect(options.silent).toBe(true);
      });

      it('should parse --raw flag', () => {
        const options = parseArgs(['--raw', 'query']);
        expect(options.raw).toBe(true);
        expect(options.format).toBe('raw');
      });

      it('should parse --quick flag', () => {
        const options = parseArgs(['--quick', 'query']);
        expect(options.quick).toBe(true);
        expect(options.limit).toBe(5);
      });

      it('should parse --rank flag', () => {
        const options = parseArgs(['--rank', 'query']);
        expect(options.rank).toBe(true);
        expect(options.sort).toBe(true);
      });

      it('should parse --sort flag', () => {
        const options = parseArgs(['--sort', 'query']);
        expect(options.sort).toBe(true);
        expect(options.score).toBe(true);
      });

      it('should parse --no-dedup flag', () => {
        const options = parseArgs(['--no-dedup', 'query']);
        expect(options.dedup).toBe(false);
      });

      it('should parse --urls flag', () => {
        const options = parseArgs(['--urls', 'query']);
        expect(options.urlsOnly).toBe(true);
      });

      it('should parse --titles flag', () => {
        const options = parseArgs(['--titles', 'query']);
        expect(options.titlesOnly).toBe(true);
      });

      it('should parse --compact flag', () => {
        const options = parseArgs(['--compact', 'query']);
        expect(options.compact).toBe(true);
      });

      it('should parse --metadata flag', () => {
        const options = parseArgs(['--metadata', 'query']);
        expect(options.metadata).toBe(true);
      });

      it('should parse --validate-output flag', () => {
        const options = parseArgs(['--validate-output', 'query']);
        expect(options.validateOutput).toBe(true);
      });

      it('should parse --engines-refresh flag', () => {
        const options = parseArgs(['--engines-refresh', 'query']);
        expect(options.refreshEngines).toBe(true);
      });

      it('should parse --has-image flag', () => {
        const options = parseArgs(['--has-image', 'query']);
        expect(options.hasImage).toBe(true);
      });
    });

    describe('agent mode', () => {
      it('should parse --agent flag', () => {
        const options = parseArgs(['--agent']);
        expect(options.agent).toBe(true);
        expect(options.format).toBe('toon');
        expect(options.validateOutput).toBe(true);
        expect(options.analyze).toBe(false);
      });

      it('should parse --ai flag', () => {
        const options = parseArgs(['--ai', 'query']);
        expect(options.agent).toBe(true);
        expect(options.format).toBe('toon');
        expect(options.validateOutput).toBe(true);
      });

      it('should parse --agent-ci flag', () => {
        const options = parseArgs(['--agent-ci', 'query']);
        expect(options.agent).toBe(true);
        expect(options.format).toBe('toon');
        expect(options.validateOutput).toBe(true);
        expect(options.strict).toBe(true);
        expect(options.offlineFirst).toBe(true);
      });

      it('should parse --agent-json flag', () => {
        const options = parseArgs(['--agent-json', 'query']);
        expect(options.agent).toBe(true);
        expect(options.format).toBe('json');
        expect(options.compact).toBe(true);
        expect(options.pretty).toBe(false);
        expect(options.validateOutput).toBe(true);
      });

      it('should parse --system-prompt with separate value', () => {
        const options = parseArgs(['--agent', '--system-prompt', 'Return only facts', 'query']);
        expect(options.systemPrompt).toBe('Return only facts');
        expect(options.query).toBe('query');
      });

      it('should parse --system-prompt=value notation', () => {
        const options = parseArgs(['--system-prompt=Return concise answers', 'query']);
        expect(options.systemPrompt).toBe('Return concise answers');
        expect(options.query).toBe('query');
      });

      it('should preserve additional equals signs in --system-prompt=value', () => {
        const options = parseArgs(['--system-prompt=Return a=b=c', 'query']);
        expect(options.systemPrompt).toBe('Return a=b=c');
      });
    });

    describe('output options', () => {
      it('should parse --output option', () => {
        const options = parseArgs(['--output', 'results.json', 'query']);
        expect(options.output).toBe('results.json');
      });

      it('should parse -o short option', () => {
        const options = parseArgs(['-o', 'output.txt', 'query']);
        expect(options.output).toBe('output.txt');
      });

      it('should preserve additional equals signs in --proxy=value', () => {
        const options = parseArgs(['--proxy=http://127.0.0.1:8080/proxy?token=a=b=c', 'query']);
        expect(options.proxy).toBe('http://127.0.0.1:8080/proxy?token=a=b=c');
      });
    });

    describe('value handling', () => {
      it('should treat bare --open as --open 1', () => {
        const options = parseArgs(['--open', 'query']);
        expect(options.open).toBe(1);
      });

      it('should fail when --max-tokens value is missing', () => {
        expect(() => parseArgs(['--max-tokens', '--json', 'query'])).toThrow(/process\.exit/);
      });
    });

    describe('filter options', () => {
      it('should parse --domain option', () => {
        const options = parseArgs(['--domain', 'example.com', 'query']);
        expect(options.domainFilter).toBe('example.com');
      });

      it('should parse --exclude-domain option', () => {
        const options = parseArgs(['--exclude-domain', 'spam.com', 'query']);
        expect(options.excludeDomain).toBe('spam.com');
      });

      it('should parse --min-score option', () => {
        const options = parseArgs(['--min-score', '0.5', 'query']);
        expect(options.minScore).toBe('0.5');
      });
    });

    describe('group option', () => {
      it('should parse --group option', () => {
        const options = parseArgs(['--group', 'dev', 'query']);
        expect(options.group).toBe('dev');
        expect(options.engines).toBeDefined();
      });

      it('should parse -g short option', () => {
        const options = parseArgs(['-g', 'ai', 'query']);
        expect(options.group).toBe('ai');
      });
    });

    describe('theme option', () => {
      it('should parse --theme option', () => {
        const options = parseArgs(['--theme', 'ocean', 'query']);
        expect(options.theme).toBe('ocean');
      });
    });

    describe('timeout option', () => {
      it('should parse --timeout option', () => {
        const options = parseArgs(['--timeout', '30000', 'query']);
        expect(options.timeout).toBe(30000);
      });
    });

    describe('retries option', () => {
      it('should parse --retries option', () => {
        const options = parseArgs(['--retries', '5', 'query']);
        expect(options.retries).toBe(5);
      });
    });

    describe('combined options', () => {
      it('should handle multiple options together', () => {
        const options = parseArgs([
          '--format',
          'json',
          '--engines',
          'google',
          '--limit',
          '20',
          '--verbose',
          'search query',
        ]);

        expect(options.format).toBe('json');
        expect(options.engines).toBe('google');
        expect(options.limit).toBe(20);
        expect(options.verbose).toBe(true);
        expect(options.query).toBe('search query');
      });
    });
  });

  describe('showHelp', () => {
    it('should display help without errors', () => {
      showHelp();
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map((c) => c.join('')).join('\n');
      expect(output).toContain('Usage: searxng [command] [flags]');
      expect(output).toContain('Commands:');
      expect(output).toContain('Global Flags (all commands):');
      expect(output).toContain('Search:');
      expect(output).toContain('Cache:');
      expect(output).toContain('jsonl/ndjson');
      expect(output).toContain('--agent-ci');
      expect(output).toContain('--agent-json');
    });
  });

  describe('showVersion', () => {
    it('should display version information', () => {
      showVersion();
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map((c) => c.join('')).join('\n');
      expect(output).toContain('SearXNG CLI');
      expect(output).toMatch(/v\d{4}\.[1-9]\d*\.[1-9]\d*(?:-[1-9]\d*)?/);
    });
  });

  describe('openInBrowser', () => {
    it('should not throw when called with a URL', () => {
      // spawn is non-configurable in CJS, so we can't spy on it directly.
      // Just verify openInBrowser doesn't throw when called.
      expect(() => openInBrowser('https://example.com')).not.toThrow();
    });

    it('should accept any URL string', () => {
      // Verify the function accepts different URL formats without throwing
      expect(() => openInBrowser('http://localhost:8080/results')).not.toThrow();
    });
  });

  describe('showSpinner', () => {
    it('should return a NodeJS.Timeout handle', () => {
      const handle = showSpinner('Searching...', Date.now());
      expect(handle).toBeDefined();
      clearInterval(handle);
    });

    it('should write spinner characters to stderr', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const handle = showSpinner('Testing...', Date.now());
      // Wait for one interval
      await new Promise((resolve) => setTimeout(resolve, 100));
      clearInterval(handle);
      expect(stderrSpy).toHaveBeenCalled();
      stderrSpy.mockRestore();
    });
  });
});
