import * as fs from 'fs';
import { decode as decodeToon } from '@toon-format/toon';
import {
  getSearxngUrl,
  setSearxngUrl,
  reloadSearxngUrl,
  VERSION,
  isLocalInstance,
  DEFAULT_TIMEOUT,
  MAX_RETRIES,
  CONFIG_DIR,
  CONFIG_FILE,
  SETTINGS_FILE,
  HISTORY_FILE,
  BOOKMARKS_FILE,
  PRESETS_FILE,
  SUGGESTIONS_FILE,
  CACHE_FILE,
  ENGINES_CACHE_FILE,
  SETUP_COMPLETE_FILE,
  DEFAULT_SEARXNG_URL,
  normalizeSearxngUrl,
  LRU_CACHE_SIZE,
  PERSISTENT_CACHE_ENABLED,
  CACHE_COMPRESSION,
  CACHE_MAX_AGE,
} from './config';
import { colorize, formatDuration, safeJsonStringify } from './utils';
import {
  loadCacheSync,
  saveCacheSync,
  getCachedResult,
  setCachedResult,
  getSemanticCachedResult,
  getCacheStats,
  showCacheStatus,
  clearCache,
  showCacheList,
  showCacheSearch,
  inspectCacheEntry,
  deleteCacheEntry,
  exportCache,
  importCache,
  pruneCache,
  showCacheHelp,
} from './cache';
import {
  parseArgs,
  showHelp,
  showVersion,
  openInBrowser,
  showSpinner,
  createDefaultOptions,
} from './cli';
import {
  buildUrl,
  expandQuery,
  deduplicateResults,
  sortByScore,
  rankResults,
  applyAdvancedFilters,
  extractMetadata,
  analyzeResults,
  showClusteredResults,
  autoRefineQuery,
  generateVectorEmbeddings,
  fetchWebpageContent,
} from './search';
import {
  formatJsonOutput,
  formatJsonlOutput,
  formatCsvOutput,
  formatMarkdownOutput,
  formatRawOutput,
  formatYamlOutput,
  formatTableOutput,
  formatTextOutput,
  formatSimpleOutput,
  formatQuickOutput,
  formatSummaryOutput,
  formatCitationOutput,
} from './formatters';
import { validateFormattedOutput } from './formatters/validation';
import { getFormatterSchemas, getSupportedSchemaFormats } from './formatters/schema';
import { formatToonOutput, formatXmlOutput, formatHtmlReportOutput } from './formatters-advanced';
import { fetchWithRetry, circuitBreaker, rateLimitedFetch, checkConnectionHealth } from './http';
import {
  discoverInstance,
  addToHistory,
  updateSuggestions,
  loadSuggestions,
  loadPresets,
  addPreset,
  showBookmarks,
  showSearchHistory,
  manageConfig,
  addBookmark,
  loadSettings,
  runSetupWizard,
  isSetupComplete,
  showSettings,
  updateSetting,
  fetchInstanceCapabilities,
  applyLocalAgentDefaults,
} from './storage';
import type { SearchResponse, SearchOptions, AdvancedFilters, OutputFormat } from './types';

let isShuttingDown = false;
let cacheLoaded = false;
let exitHandlersSetup = false;

function showGlobalFlagHelp(): void {
  console.log();
  console.log('Global flags (supported for all commands):');
  console.log('  --help, -h              Show command help');
  console.log('  --version, -v           Show version');
  console.log('  --verbose, -V           Verbose output');
  console.log('  --silent, -s            Minimal output');
  console.log('  --no-cache              Skip cache reads/writes');
  console.log('  --format, -f <fmt>      Output format override');
  console.log('  --output, -o <file>     Write output to file');
  console.log('  --settings-json         Machine-readable effective settings');
  console.log('  --paths-json            Machine-readable ~/.searxng-cli paths');
}

function showCommandHelp(command: string): void {
  const cmd = command.toLowerCase();
  if (cmd === 'search' || cmd === 's') {
    console.log('Usage: searxng search [flags] <query>');
    console.log('Aliases: s');
    console.log();
    console.log('Examples:');
    console.log('  searxng search "bun runtime"');
    console.log('  searxng search --agent --limit 5 "typescript mcp server"');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'setup') {
    console.log('Usage: searxng setup [--local] [flags]');
    console.log();
    console.log('Examples:');
    console.log('  searxng setup');
    console.log('  searxng setup --local');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'settings') {
    console.log('Usage: searxng settings [json] [flags]');
    console.log();
    console.log('Examples:');
    console.log('  searxng settings');
    console.log('  searxng settings json');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'set') {
    console.log('Usage: searxng set <key> <value> [flags]');
    console.log();
    console.log(
      'Keys: url, local-url, limit, format, theme, engines, timeout, history, max-history,'
    );
    console.log(
      '      force-local-routing, force-local-agent-routing, param, params-json, params-query,'
    );
    console.log('      unset-param, clear-params');
    console.log();
    console.log('Examples:');
    console.log('  searxng set url http://localhost:8080');
    console.log('  searxng set format toon');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'cache') {
    console.log('Usage: searxng cache <subcommand> [args] [flags]');
    console.log();
    console.log(
      'Subcommands: status, list [n], search <term>, inspect <n>, delete <n>, clear, export <file>,'
    );
    console.log('             import <file>, prune <days>, help');
    console.log();
    console.log('Examples:');
    console.log('  searxng cache status');
    console.log('  searxng cache list 20');
    console.log('  searxng cache clear');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'formats') {
    console.log('Usage: searxng formats <verify|schema|validate> [args] [flags]');
    console.log();
    console.log('Examples:');
    console.log('  searxng formats verify "release smoke test"');
    console.log('  searxng formats schema json');
    console.log('  searxng formats validate json ./result.json');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'instance') {
    console.log('Usage: searxng instance [info|json] [flags]');
    console.log();
    console.log('Examples:');
    console.log('  searxng instance info');
    console.log('  searxng instance json');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'config') {
    console.log('Usage: searxng config [show|edit|reset] [flags]');
    console.log();
    console.log('Examples:');
    console.log('  searxng config show');
    console.log('  searxng config reset');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'doctor') {
    console.log('Usage: searxng doctor [--json] [flags]');
    console.log();
    console.log('Examples:');
    console.log('  searxng doctor');
    console.log('  searxng doctor --json');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'health') {
    console.log('Usage: searxng health [flags]');
    console.log();
    console.log('Examples:');
    console.log('  searxng health');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'history') {
    console.log('Usage: searxng history [flags]');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'bookmarks') {
    console.log('Usage: searxng bookmarks [flags]');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'presets') {
    console.log('Usage: searxng presets [flags]');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'suggestions') {
    console.log('Usage: searxng suggestions [flags]');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'paths') {
    console.log('Usage: searxng paths [flags]');
    console.log();
    console.log('Outputs managed ~/.searxng-cli file locations as JSON.');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'version') {
    console.log('Usage: searxng version [flags]');
    showGlobalFlagHelp();
    return;
  }
  if (cmd === 'test') {
    console.log('Usage: searxng test [flags]');
    showGlobalFlagHelp();
    return;
  }
  showHelp();
}

function normalizeCommandArgs(rawArgs: string[]): string[] {
  if (rawArgs.length === 0) return rawArgs;
  const command = (rawArgs[0] ?? '').toLowerCase();
  if (!command || command.startsWith('-')) return rawArgs;

  const args = rawArgs.slice(1);
  const sub = (args[0] ?? '').toLowerCase();
  const hasHelp = args.includes('--help') || args.includes('-h');
  if (hasHelp) {
    showCommandHelp(command);
    process.exit(0);
  }

  if (command === 'search' || command === 's') return args;
  if (command === 'setup') {
    if (sub === '--local' || sub === 'local') {
      return ['--setup-local', ...args.slice(1)];
    }
    return ['--setup', ...args];
  }
  if (command === 'settings') {
    if (sub === 'json' || sub === '--json') return ['--settings-json', ...args.slice(1)];
    return ['--settings', ...args];
  }
  if (command === 'paths') return ['--paths-json', ...args];
  if (command === 'health') return ['--health-check', ...args];
  if (command === 'doctor') {
    if (sub === '--json' || sub === 'json') return ['--doctor-json', ...args.slice(1)];
    return ['--doctor', ...args];
  }
  if (command === 'instance') {
    if (sub === 'json' || sub === '--json') return ['--instance-info-json', ...args.slice(1)];
    return ['--instance-info', ...args];
  }
  if (command === 'suggestions') return ['--suggestions', ...args];
  if (command === 'presets') return ['--presets', ...args];
  if (command === 'history') return ['--history', ...args];
  if (command === 'bookmarks') return ['--bookmarks', ...args];
  if (command === 'version') return ['--version', ...args];
  if (command === 'test') return ['--test', ...args];
  if (command === 'config') return ['--config', args[0] ?? 'show', ...args.slice(1)];
  if (command === 'formats') {
    if (sub === 'verify') {
      if (args[1] === '--json' || args[1] === 'json')
        return ['--verify-formats-json', ...args.slice(2)];
      return ['--verify-formats', ...args.slice(1)];
    }
    if (sub === 'schema') {
      if (args[1] === '--json' || args[1] === 'json') return ['--schema-json', args[2] ?? 'all'];
      return ['--schema', args[1] ?? 'all'];
    }
    if (sub === 'validate') {
      if (args[1] === '--json' || args[1] === 'json') {
        return ['--validate-payload-json', ...args.slice(2)];
      }
      return ['--validate-payload', ...args.slice(1)];
    }
  }
  if (command === 'cache') {
    if (!sub || sub === 'status')
      return ['--cache-status', ...args.slice(sub === 'status' ? 1 : 0)];
    if (sub === 'json') return ['--cache-status-json', ...args.slice(1)];
    if (sub === 'list') return ['--cache-list', ...args.slice(1)];
    if (sub === 'search') return ['--cache-search', ...args.slice(1)];
    if (sub === 'inspect') return ['--cache-inspect', ...args.slice(1)];
    if (sub === 'delete') return ['--cache-delete', ...args.slice(1)];
    if (sub === 'clear') return ['--cache-clear', ...args.slice(1)];
    if (sub === 'export') return ['--cache-export', ...args.slice(1)];
    if (sub === 'import') return ['--cache-import', ...args.slice(1)];
    if (sub === 'prune') return ['--cache-prune', ...args.slice(1)];
    if (sub === 'help') return ['--cache-help', ...args.slice(1)];
  }
  if (command === 'set') {
    const key = sub;
    const value = args[1];
    if (key === 'url') return ['--set-url', value ?? ''];
    if (key === 'local-url') return ['--set-local-url'];
    if (key === 'limit') return ['--set-limit', value ?? ''];
    if (key === 'format') return ['--set-format', value ?? ''];
    if (key === 'theme') return ['--set-theme', value ?? ''];
    if (key === 'engines') return ['--set-engines', value ?? ''];
    if (key === 'timeout') return ['--set-timeout', value ?? ''];
    if (key === 'history') return ['--set-history', value ?? ''];
    if (key === 'max-history') return ['--set-max-history', value ?? ''];
    if (key === 'force-local-routing') return ['--set-force-local-routing', value ?? ''];
    if (key === 'force-local-agent-routing')
      return ['--set-force-local-agent-routing', value ?? ''];
    if (key === 'param') return ['--set-param', value ?? ''];
    if (key === 'params-json') return ['--set-params-json', value ?? ''];
    if (key === 'params-query') return ['--set-params-query', value ?? ''];
    if (key === 'unset-param') return ['--unset-param', value ?? ''];
    if (key === 'clear-params') return ['--clear-params'];
  }
  return rawArgs;
}

function parseMultiQueries(raw: string): string[] {
  return raw
    .split(/\r?\n|;;|\|\||;/g)
    .map((query) => query.trim())
    .filter((query) => query.length > 0);
}

function normalizeValidationFormat(raw: string): OutputFormat | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'md') return 'markdown';
  if (normalized === 'yml') return 'yaml';
  if (normalized === 'ndjson') return 'jsonl';
  if (normalized === 'html') return 'html-report';
  return normalized as OutputFormat;
}

function readValidationPayload(inputPath: string | null): string {
  if (inputPath && inputPath !== '-') {
    return fs.readFileSync(inputPath, 'utf8');
  }
  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, 'utf8');
  }
  throw new Error('Provide an input file path or pipe payload via stdin');
}

function toPlainParams(searchParams: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

function enforceLocalRouting(options: Pick<SearchOptions, 'agent' | 'verbose' | 'silent'>): void {
  const settings = loadSettings();
  if (
    options.agent &&
    settings.forceLocalAgentRouting !== false &&
    getSearxngUrl() !== DEFAULT_SEARXNG_URL
  ) {
    setSearxngUrl(DEFAULT_SEARXNG_URL);
    if (options.verbose && !options.silent) {
      console.error(
        colorize(`Agent mode routing forced to local SearXNG: ${DEFAULT_SEARXNG_URL}`, 'yellow')
      );
    }
    return;
  }

  if (settings.forceLocalRouting !== false) {
    const configuredUrl = normalizeSearxngUrl(settings.searxngUrl) ?? DEFAULT_SEARXNG_URL;
    if (getSearxngUrl() !== configuredUrl) {
      setSearxngUrl(configuredUrl);
      if (options.verbose && !options.silent) {
        console.error(colorize(`Routing forced to configured SearXNG: ${configuredUrl}`, 'yellow'));
      }
    }
  }
}

function getExplicitPresetOverrideKeys(args: string[]): Set<keyof SearchOptions> {
  const keys = new Set<keyof SearchOptions>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--json' || arg === '--toon' || arg === '--csv' || arg === '--xml') {
      keys.add('format');
    }
    if (arg === '--yaml' || arg === '--yml' || arg === '--markdown' || arg === '--md') {
      keys.add('format');
    }
    if (arg === '--table' || arg === '--text' || arg === '--simple') {
      keys.add('format');
    }
    if (arg === '--html' || arg === '--html-report' || arg === '--raw') {
      keys.add('format');
    }
    if (arg === '--jsonl' || arg === '--ndjson' || arg === '--stream') {
      keys.add('format');
      keys.add('jsonl');
    }
    if (arg === '--agent' || arg === '--ai') {
      keys.add('agent');
      keys.add('format');
      keys.add('compact');
    }
    if (arg === '--agent-json') {
      keys.add('agent');
      keys.add('format');
      keys.add('compact');
      keys.add('validateOutput');
    }
    if (arg === '--agent-ci') {
      keys.add('agent');
      keys.add('format');
      keys.add('compact');
      keys.add('strict');
      keys.add('validateOutput');
      keys.add('offlineFirst');
    }
    if (arg === '--offline-first' || arg === '--cache-only') {
      keys.add('offlineFirst');
    }
    if (arg === '--validate' || arg === '--validate-output') {
      keys.add('validateOutput');
    }
    if (arg === '--strict' || arg === '--fail-on-empty') {
      keys.add('strict');
    }
    if (arg.startsWith('--format') || arg === '-f') keys.add('format');
    if (arg.startsWith('--engines') || arg === '-e') keys.add('engines');
    if (arg.startsWith('--lang') || arg === '-l') keys.add('lang');
    if (arg.startsWith('--page') || arg === '-p') keys.add('page');
    if (arg.startsWith('--safe')) keys.add('safeSearch');
    if (arg.startsWith('--time') || arg === '-t') keys.add('timeRange');
    if (arg.startsWith('--category') || arg === '-c') keys.add('category');
    if (arg.startsWith('--limit') || arg === '-n') keys.add('limit');
    if (arg.startsWith('--timeout')) keys.add('timeout');
    if (arg.startsWith('--retries') || arg === '-r') keys.add('retries');
    if (arg === '--score') keys.add('score');
    if (arg === '--no-dedup') keys.add('dedup');
    if (arg === '--sort') keys.add('sort');
    if (arg === '--compact') keys.add('compact');
    if (arg === '--metadata') keys.add('metadata');
    if (arg === '--analyze' || arg === '--analysis') keys.add('analyze');
    if (arg.startsWith('--domain')) keys.add('domainFilter');
    if (arg.startsWith('--exclude-domain')) keys.add('excludeDomain');
    if (arg.startsWith('--min-score')) keys.add('minScore');
    if (arg === '--has-image') keys.add('hasImage');
    if (arg.startsWith('--date-after')) keys.add('dateAfter');
    if (arg.startsWith('--date-before')) keys.add('dateBefore');
    if (arg === '--params-json' || arg.startsWith('--params-json=')) keys.add('searxngParams');
    if (arg === '--params-file' || arg.startsWith('--params-file=')) keys.add('searxngParams');
    if (arg === '--param' || arg.startsWith('--param=')) keys.add('searxngParams');
    if (
      arg === '--sx' ||
      arg === '--sx-param' ||
      arg.startsWith('--sx=') ||
      arg.startsWith('--sx-param=')
    )
      keys.add('searxngParams');
    if (
      arg === '--sx-query' ||
      arg === '--sx-params' ||
      arg.startsWith('--sx-query=') ||
      arg.startsWith('--sx-params=')
    ) {
      keys.add('searxngParams');
    }
    if (arg === '--sx-theme' || arg.startsWith('--sx-theme=')) keys.add('searxngParams');
    if (arg === '--sx-enabled-plugins' || arg.startsWith('--sx-enabled-plugins=')) {
      keys.add('searxngParams');
    }
    if (arg === '--sx-disabled-plugins' || arg.startsWith('--sx-disabled-plugins=')) {
      keys.add('searxngParams');
    }
    if (arg === '--sx-enabled-engines' || arg.startsWith('--sx-enabled-engines=')) {
      keys.add('searxngParams');
    }
    if (arg === '--sx-disabled-engines' || arg.startsWith('--sx-disabled-engines=')) {
      keys.add('searxngParams');
    }
    if (arg === '--sx-enabled-categories' || arg.startsWith('--sx-enabled-categories=')) {
      keys.add('searxngParams');
    }
    if (arg === '--sx-disabled-categories' || arg.startsWith('--sx-disabled-categories=')) {
      keys.add('searxngParams');
    }
    if (arg === '--sx-image-proxy' || arg.startsWith('--sx-image-proxy=')) {
      keys.add('searxngParams');
    }
  }
  return keys;
}

function applyPresetToOptions(
  options: SearchOptions,
  preset: Record<string, unknown>,
  explicitKeys: Set<keyof SearchOptions>
): void {
  const allowedKeys: Array<keyof SearchOptions> = [
    'format',
    'engines',
    'lang',
    'page',
    'safeSearch',
    'timeRange',
    'category',
    'limit',
    'timeout',
    'retries',
    'score',
    'dedup',
    'sort',
    'compact',
    'metadata',
    'agent',
    'analyze',
    'offlineFirst',
    'validateOutput',
    'strict',
    'domainFilter',
    'excludeDomain',
    'minScore',
    'hasImage',
    'dateAfter',
    'dateBefore',
    'searxngParams',
  ];

  for (const key of allowedKeys) {
    if (explicitKeys.has(key)) {
      continue;
    }
    if (!(key in preset)) {
      continue;
    }
    if (key === 'searxngParams') {
      const presetParams = preset[key];
      if (presetParams && typeof presetParams === 'object' && !Array.isArray(presetParams)) {
        options.searxngParams = {
          ...(options.searxngParams ?? {}),
          ...(presetParams as Record<string, string>),
        };
      }
      continue;
    }
    (options as unknown as Record<string, unknown>)[key] = preset[key];
  }
}

async function runAutocomplete(options: SearchOptions): Promise<number> {
  enforceLocalRouting(options);
  if (!options.query.trim()) {
    console.error(colorize('Error: --autocomplete requires a query', 'red'));
    return 1;
  }

  const endpoints = ['/autocompleter', '/autocomplete'];
  let lastError = 'No autocomplete endpoints available';

  for (const endpoint of endpoints) {
    try {
      const response = await rateLimitedFetch(
        `${getSearxngUrl()}${endpoint}?q=${encodeURIComponent(options.query)}`,
        {
          headers: { 'User-Agent': `searxng-cli/${VERSION}`, Accept: 'application/json' },
        }
      );
      if (!response.ok) {
        lastError = `HTTP ${response.status} from ${endpoint}`;
        continue;
      }
      const payload = (await response.json()) as unknown;
      const suggestions = Array.isArray(payload)
        ? payload
            .map((item) => {
              if (typeof item === 'string') return item;
              if (Array.isArray(item) && typeof item[0] === 'string') return item[0];
              if (
                item &&
                typeof item === 'object' &&
                'phrase' in item &&
                typeof (item as Record<string, unknown>).phrase === 'string'
              ) {
                return (item as Record<string, string>).phrase;
              }
              return null;
            })
            .filter((value): value is string => Boolean(value))
        : [];

      const deduped = [...new Set(suggestions)].slice(0, options.limit > 0 ? options.limit : 20);
      if (options.format === 'json' || options.format === 'raw') {
        console.log(
          safeJsonStringify(
            {
              schemaVersion: '1.0',
              format: 'autocomplete',
              query: options.query,
              source: getSearxngUrl(),
              count: deduped.length,
              suggestions: deduped,
            },
            options.compact ? 0 : 2
          )
        );
      } else {
        console.log(colorize(`\nAutocomplete suggestions for "${options.query}"`, 'cyan,bold'));
        if (deduped.length === 0) {
          console.log(colorize('No suggestions returned', 'dim'));
        } else {
          deduped.forEach((suggestion, index) => {
            console.log(`${index + 1}. ${suggestion}`);
          });
        }
      }
      return 0;
    } catch (error) {
      lastError = (error as Error).message;
    }
  }

  console.error(colorize(`Autocomplete failed: ${lastError}`, 'red'));
  return 1;
}

function savePresetFromOptions(name: string, options: SearchOptions): void {
  const presetPayload: Record<string, unknown> = {
    format: options.format,
    engines: options.engines,
    lang: options.lang,
    safeSearch: options.safeSearch,
    timeRange: options.timeRange,
    category: options.category,
    limit: options.limit,
    timeout: options.timeout,
    retries: options.retries,
    score: options.score,
    dedup: options.dedup,
    sort: options.sort,
    compact: options.compact,
    metadata: options.metadata,
    agent: options.agent,
    analyze: options.analyze,
    offlineFirst: options.offlineFirst,
    validateOutput: options.validateOutput,
    strict: options.strict,
    domainFilter: options.domainFilter,
    excludeDomain: options.excludeDomain,
    minScore: options.minScore,
    hasImage: options.hasImage,
    dateAfter: options.dateAfter,
    dateBefore: options.dateBefore,
    searxngParams: options.searxngParams ?? {},
  };
  addPreset(name, presetPayload);
}

export function ensureCacheLoaded(): number {
  if (!cacheLoaded) {
    const count = loadCacheSync();
    cacheLoaded = true;
    if (process.env.DEBUG) {
      console.error(`Cache loaded: ${count} entries`);
    }
    return count;
  }
  return 0;
}

export function resetCacheLoaded(): void {
  cacheLoaded = false;
}

export function setupExitHandlers(): void {
  if (exitHandlersSetup) return;
  exitHandlersSetup = true;

  process.on('beforeExit', () => {
    if (!isShuttingDown) {
      isShuttingDown = true;
      saveCacheSync();
    }
  });

  process.on('exit', () => {
    if (!isShuttingDown) {
      isShuttingDown = true;
      saveCacheSync();
    }
  });

  process.on('SIGINT', () => {
    if (!isShuttingDown) {
      isShuttingDown = true;
      saveCacheSync();
      console.log(colorize('\n\nInterrupted by user.', 'yellow'));
      process.exit(0);
    }
  });

  process.on('SIGTERM', () => {
    if (!isShuttingDown) {
      isShuttingDown = true;
      saveCacheSync();
      console.log(colorize('\n\nTerminated.', 'yellow'));
      process.exit(0);
    }
  });

  process.on('unhandledRejection', (reason: unknown) => {
    console.error(colorize(`Unhandled error: ${(reason as Error).message}`, 'red'));
    process.exit(1);
  });
}

export async function performSearch(options: SearchOptions): Promise<SearchResponse | null> {
  enforceLocalRouting(options);
  ensureCacheLoaded();
  const url = buildUrl(options);
  if (!options.noCache) {
    let cached = getCachedResult(options.query, options);
    if (!cached) {
      cached = getSemanticCachedResult(options.query, options);
      if (cached && options.verbose) {
        console.error(
          colorize(
            `\n✓ Using semantic cached result (Similarity: ${(cached._similarity ?? 0).toFixed(2)})`,
            'green'
          )
        );
      }
    } else if (options.verbose) {
      console.error(colorize('\n✓ Using cached result (CACHE HIT)', 'green'));
    }

    if (cached) {
      // Background fetch to continually build and improve local cache
      fetchWithRetry(url, { ...options, silent: true, verbose: false }, options.retries)
        .then(async (res) => {
          if (res.ok) {
            const freshData = (await res.json()) as SearchResponse;
            setCachedResult(options.query, options, freshData);
          }
        })
        .catch(() => {}); // Ignore errors in background fetch

      return await formatAndOutput(cached, options);
    }

    if (options.offlineFirst) {
      if (!options.silent) {
        console.error(
          colorize('\n⚠ Offline-first mode enabled and no cached result was found', 'yellow')
        );
      }
      return await formatAndOutput(
        {
          query: options.query,
          results: [],
          suggestions: [],
          answers: [],
          corrections: [],
          number_of_results: 0,
          timing: 'offline',
        },
        options
      );
    }
  }
  if (options.verbose) {
    console.error(colorize('\n╔═══════════════════ REQUEST ═══════════════════╗', 'dim'));
    console.error(`  URL: ${url.toString()}`);
    console.error(`  Query: ${options.query}`);
    console.error(colorize('╚════════════════════════════════════════════════╝\n', 'dim'));
  }

  const startTime = Date.now();
  let spinnerInterval: NodeJS.Timeout | null = null;
  if (!options.verbose && process.stderr.isTTY)
    spinnerInterval = showSpinner('Searching...', startTime);

  try {
    const response = await fetchWithRetry(url, options, options.retries);
    if (spinnerInterval) {
      clearInterval(spinnerInterval);
      process.stderr.write('\r' + ' '.repeat(50) + '\r');
    }
    const duration = Date.now() - startTime;
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    if (!options.silent && options.verbose) {
      console.error(colorize(`✓ Response received in ${formatDuration(duration)}`, 'green'));
    }
    const data = (await response.json()) as SearchResponse;
    data.timing = formatDuration(duration);

    if (options.autoRefine && (!data.results || data.results.length === 0)) {
      const refinedQuery = autoRefineQuery(options.query);
      if (refinedQuery !== options.query) {
        if (!options.silent) {
          console.error(
            colorize(`\n↻ No results found. Auto-refining query to: "${refinedQuery}"`, 'yellow')
          );
        }
        options.query = refinedQuery;
        options.autoRefine = false;
        return performSearch(options);
      }
    }

    if (!options.noCache) setCachedResult(options.query, options, data);
    circuitBreaker.recordSuccess();
    return await formatAndOutput(data, options);
  } catch (err) {
    if (spinnerInterval) {
      clearInterval(spinnerInterval);
      process.stderr.write('\r' + ' '.repeat(50) + '\r');
    }
    const error = err as Error & { name?: string; code?: string };
    if (!options.silent) {
      if (error.name === 'AbortError') {
        console.error(
          colorize(`\n✗ Request timed out after ${formatDuration(options.timeout)}`, 'red')
        );
      } else if (error.code === 'ECONNREFUSED') {
        console.error(colorize(`\n✗ Connection refused to ${getSearxngUrl()}`, 'red'));
      } else {
        console.error(colorize(`\n✗ Error: ${error.message}`, 'red'));
      }
    }
    return null;
  }
}

export async function formatAndOutput(
  data: SearchResponse,
  options: SearchOptions
): Promise<SearchResponse> {
  if (options.dedup && data.results) {
    data.results = deduplicateResults(data.results);
  }

  if (options.fetchContent && data.results) {
    if (!options.silent && process.stderr.isTTY) {
      console.error(colorize('Fetching webpage content...', 'cyan'));
    }
    data.results = await fetchWebpageContent(data.results);
  }

  if (options.sort && data.results) {
    data.results = sortByScore(data.results);
  }

  if (options.rank && data.results && options.query) {
    data.results = rankResults(data.results, options.query);
  }

  const advancedFilters: AdvancedFilters = {
    domain: options.domainFilter,
    excludeDomain: options.excludeDomain,
    minScore: options.minScore,
    hasImage: options.hasImage,
    dateAfter: options.dateAfter,
    dateBefore: options.dateBefore,
  };

  if (Object.values(advancedFilters).some((v) => v)) {
    data.results = applyAdvancedFilters(data.results ?? [], advancedFilters);
  }

  if (options.exportEmbeddings && data.results) {
    data.results = generateVectorEmbeddings(data.results);
  }

  if (options.silent && data.results && data.results.length > 0) {
    const limit =
      options.limit === 0 ? data.results.length : Math.min(options.limit, data.results.length);
    data.results.slice(0, limit).forEach((r) => console.log(r.url ?? r.link ?? ''));
    return data;
  }

  if (options.urlsOnly && data.results) {
    const urls = data.results
      .slice(0, options.limit === 0 ? undefined : options.limit)
      .map((r) => r.url ?? r.link ?? '');
    console.log(urls.join('\n'));
    return data;
  }

  if (options.titlesOnly && data.results) {
    const titles = data.results
      .slice(0, options.limit === 0 ? undefined : options.limit)
      .map((r) => {
        let title = r.title ?? 'No title';
        if (options.unescape) title = title.replace(/&[^;]+;/g, (e) => e);
        return title;
      });
    console.log(titles.join('\n'));
    return data;
  }

  if (options.jsonl && data.results) {
    const jsonl = formatJsonlOutput(data, options);
    if (options.validateOutput) {
      const validation = validateFormattedOutput('jsonl', jsonl);
      if (!validation.valid) {
        throw new Error(`Output validation failed for jsonl: ${validation.message}`);
      }
      if (options.verbose && !options.silent) {
        console.error(colorize(`✓ ${validation.message}`, 'green'));
      }
    }
    if (jsonl.length > 0) {
      console.log(jsonl);
    }
    return data;
  }

  if (options.metadata) {
    const metadata = extractMetadata(data.results ?? []);
    console.log(JSON.stringify(metadata, null, options.compact ? 0 : 2));
    return data;
  }

  if (options.analyze && !options.agent) {
    const analysis = analyzeResults(data.results ?? [], options.query);
    console.log(JSON.stringify(analysis, null, options.compact ? 0 : 2));
    return data;
  }

  if (options.cluster) {
    showClusteredResults(data.results ?? [], options.cluster);
    return data;
  }

  let output: string;
  const formatMap: Record<string, () => string> = {
    raw: () => formatRawOutput(data),
    csv: () => formatCsvOutput(data, options),
    markdown: () => formatMarkdownOutput(data, options),
    md: () => formatMarkdownOutput(data, options),
    yaml: () => formatYamlOutput(data, options),
    yml: () => formatYamlOutput(data, options),
    toon: () => formatToonOutput(data, options),
    table: () => formatTableOutput(data, options),
    html: () => formatHtmlReportOutput(data, options),
    'html-report': () => formatHtmlReportOutput(data, options),
    xml: () => formatXmlOutput(data, options),
    text: () => formatTextOutput(data, options),
    simple: () => formatSimpleOutput(data, options),
    json: () => formatJsonOutput(data, options),
    jsonl: () => formatJsonlOutput(data, options),
  };

  if (options.citation) {
    output = formatCitationOutput(data, options);
  } else if (options.quick) {
    output = formatQuickOutput(data, options);
  } else if (options.summary) {
    output = formatSummaryOutput(data, options);
  } else if (formatMap[options.format]) {
    output = formatMap[options.format]();
  } else {
    output = JSON.stringify(data, null, options.pretty ? 2 : 0);
  }

  if (options.validateOutput) {
    const validation = validateFormattedOutput(options.format, output);
    if (!validation.valid) {
      throw new Error(`Output validation failed for ${options.format}: ${validation.message}`);
    }
    if (options.verbose && !options.silent) {
      console.error(colorize(`✓ ${validation.message}`, 'green'));
    }
  }

  if (options.systemPrompt) {
    output = `<system_prompt>\n${options.systemPrompt}\n</system_prompt>\n\n<search_results>\n${output}\n</search_results>`;
  }

  if (options.output) {
    fs.writeFileSync(options.output, output);
    console.log(colorize(`\n✓ Results saved to ${options.output}`, 'green'));
  } else if (options.export) {
    fs.writeFileSync(options.export, output);
    console.log(colorize(`\n✓ Results exported to ${options.export}`, 'green'));
  } else {
    console.log(output);
  }

  if (options.open !== null && data.results && data.results[options.open - 1]) {
    openInBrowser(data.results[options.open - 1]?.url ?? '');
  }

  if (
    options.bookmark !== null &&
    data.results &&
    data.results[parseInt(options.bookmark, 10) - 1]
  ) {
    const result = data.results[parseInt(options.bookmark, 10) - 1];
    if (result) {
      addBookmark(result);
      console.log(colorize(`\n✓ Bookmarked result #${options.bookmark}`, 'green'));
    }
  }

  return data;
}

async function runDoctor(asJson = false): Promise<number> {
  ensureCacheLoaded();
  reloadSearxngUrl();
  const settings = loadSettings();
  const currentUrl = getSearxngUrl();
  const checks: Array<{ id: string; name: string; pass: boolean; detail: string }> = [];

  const addCheck = (name: string, pass: boolean, detail: string): void => {
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    checks.push({ id, name, pass, detail });
  };

  addCheck(
    'Settings URL',
    settings.searxngUrl === currentUrl,
    settings.searxngUrl === currentUrl
      ? currentUrl
      : `settings=${settings.searxngUrl} runtime=${currentUrl}`
  );
  addCheck(
    'Default Local URL',
    currentUrl === DEFAULT_SEARXNG_URL,
    `runtime=${currentUrl} default=${DEFAULT_SEARXNG_URL}`
  );
  addCheck(
    'Config Directory',
    process.env.SEARXNG_CLI_CONFIG_DIR
      ? CONFIG_DIR === process.env.SEARXNG_CLI_CONFIG_DIR
      : CONFIG_DIR.endsWith('/.searxng-cli'),
    process.env.SEARXNG_CLI_CONFIG_DIR ? `path=${CONFIG_DIR} (env override)` : `path=${CONFIG_DIR}`
  );
  addCheck(
    'Settings File',
    process.env.SEARXNG_CLI_CONFIG_DIR
      ? SETTINGS_FILE === `${process.env.SEARXNG_CLI_CONFIG_DIR}/settings.json`
      : SETTINGS_FILE.endsWith('/.searxng-cli/settings.json'),
    process.env.SEARXNG_CLI_CONFIG_DIR
      ? `path=${SETTINGS_FILE} (env override)`
      : `path=${SETTINGS_FILE}`
  );
  addCheck(
    'Setup Marker File',
    process.env.SEARXNG_CLI_CONFIG_DIR
      ? SETUP_COMPLETE_FILE === `${process.env.SEARXNG_CLI_CONFIG_DIR}/.setup-complete`
      : SETUP_COMPLETE_FILE.endsWith('/.searxng-cli/.setup-complete'),
    process.env.SEARXNG_CLI_CONFIG_DIR
      ? `path=${SETUP_COMPLETE_FILE} (env override)`
      : `path=${SETUP_COMPLETE_FILE}`
  );
  addCheck('Unlimited Cache', LRU_CACHE_SIZE <= 0, `LRU_CACHE_SIZE=${LRU_CACHE_SIZE}`);
  addCheck(
    'Persistent Cache',
    PERSISTENT_CACHE_ENABLED,
    `persistent=${String(PERSISTENT_CACHE_ENABLED)} compression=${String(CACHE_COMPRESSION)}`
  );
  addCheck(
    'Cache Max Age',
    CACHE_MAX_AGE === Infinity,
    CACHE_MAX_AGE === Infinity ? 'infinite (no expiry)' : `${CACHE_MAX_AGE}ms`
  );

  try {
    const response = await rateLimitedFetch(`${currentUrl}/config`, {
      headers: { 'User-Agent': `searxng-cli/${VERSION}` },
    });
    addCheck(
      'Instance /config',
      response.ok,
      response.ok ? 'reachable' : `HTTP ${response.status}`
    );
  } catch (error) {
    addCheck('Instance /config', false, (error as Error).message);
  }

  try {
    await discoverInstance(false);
    addCheck('Instance Discovery', true, 'engines/categories cache refreshed or loaded');
  } catch (error) {
    addCheck('Instance Discovery', false, (error as Error).message);
  }

  const probeOptions: SearchOptions = {
    ...createDefaultOptions(),
    query: 'searxng cli doctor format probe',
    format: 'toon',
    limit: 2,
    noCache: true,
    silent: true,
    validateOutput: true,
  };

  let probeData: SearchResponse | null = null;
  try {
    const response = await fetchWithRetry(
      buildUrl(probeOptions),
      probeOptions,
      probeOptions.retries
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    probeData = (await response.json()) as SearchResponse;
    addCheck('Probe Search', true, `${probeData.results?.length ?? 0} results`);
  } catch (error) {
    addCheck('Probe Search', false, (error as Error).message);
  }

  if (probeData) {
    const formats: OutputFormat[] = [
      'toon',
      'json',
      'jsonl',
      'raw',
      'csv',
      'yaml',
      'yml',
      'xml',
      'markdown',
      'md',
      'table',
      'text',
      'simple',
      'html',
      'html-report',
    ];
    const formatters: Record<
      OutputFormat,
      (data: SearchResponse, options: SearchOptions) => string
    > = {
      toon: formatToonOutput,
      json: formatJsonOutput,
      jsonl: formatJsonlOutput,
      raw: formatRawOutput,
      csv: formatCsvOutput,
      yaml: formatYamlOutput,
      yml: formatYamlOutput,
      xml: formatXmlOutput,
      markdown: formatMarkdownOutput,
      md: formatMarkdownOutput,
      table: formatTableOutput,
      text: formatTextOutput,
      simple: formatSimpleOutput,
      html: formatHtmlReportOutput,
      'html-report': formatHtmlReportOutput,
    };

    for (const format of formats) {
      try {
        const output = formatters[format](probeData, { ...probeOptions, format });
        const validation = validateFormattedOutput(format, output);
        addCheck(
          `Format ${format}`,
          validation.valid,
          validation.valid ? 'validated' : validation.message
        );
      } catch (error) {
        addCheck(`Format ${format}`, false, (error as Error).message);
      }
    }
  }

  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          schemaVersion: '1.0',
          format: 'doctor',
          checkedAt: new Date().toISOString(),
          source: currentUrl,
          success: failed === 0,
          passed,
          failed,
          total: checks.length,
          settingsFile: SETTINGS_FILE,
          configDir: CONFIG_DIR,
          checks: checks.map((check) => ({
            id: check.id,
            name: check.name,
            ok: check.pass,
            pass: check.pass,
            detail: check.detail,
          })),
        },
        null,
        2
      )
    );
  } else {
    console.log(
      colorize('\n╔════════════════════════════════════════════════════════════╗', 'cyan')
    );
    console.log(
      colorize('║              SearXNG CLI Doctor                            ║', 'bold,brightGreen')
    );
    console.log(colorize('╚════════════════════════════════════════════════════════════╝', 'cyan'));
    console.log();
    for (const check of checks) {
      const symbol = check.pass ? colorize('✓', 'green') : colorize('✗', 'red');
      console.log(`  ${symbol} ${check.name}: ${check.detail}`);
    }
    console.log();
    console.log(
      failed === 0
        ? colorize(`Doctor result: ${passed}/${checks.length} checks passed`, 'green')
        : colorize(
            `Doctor result: ${passed}/${checks.length} checks passed, ${failed} failed`,
            'red'
          )
    );
  }
  return failed === 0 ? 0 : 1;
}

async function runFormatVerification(query: string, asJson: boolean): Promise<number> {
  ensureCacheLoaded();
  const probeOptions: SearchOptions = {
    ...createDefaultOptions(),
    query: query.trim() || 'searxng format verification',
    format: 'toon',
    limit: 3,
    noCache: true,
    silent: true,
    validateOutput: true,
  };

  let probeData: SearchResponse;
  try {
    const response = await fetchWithRetry(
      buildUrl(probeOptions),
      probeOptions,
      probeOptions.retries
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    probeData = (await response.json()) as SearchResponse;
  } catch (error) {
    if (asJson) {
      console.log(
        JSON.stringify(
          {
            schemaVersion: '1.0',
            format: 'format-verification',
            query: probeOptions.query,
            checkedAt: new Date().toISOString(),
            source: getSearxngUrl(),
            success: false,
            resultCount: 0,
            error: (error as Error).message,
            formats: [],
          },
          null,
          2
        )
      );
    } else {
      console.log(colorize(`\n✗ Format verification failed: ${(error as Error).message}`, 'red'));
    }
    return 1;
  }

  const formats: OutputFormat[] = [
    'toon',
    'json',
    'jsonl',
    'raw',
    'csv',
    'yaml',
    'yml',
    'xml',
    'markdown',
    'md',
    'table',
    'text',
    'simple',
    'html',
    'html-report',
  ];
  const formatters: Record<OutputFormat, (data: SearchResponse, options: SearchOptions) => string> =
    {
      toon: formatToonOutput,
      json: formatJsonOutput,
      jsonl: formatJsonlOutput,
      raw: formatRawOutput,
      csv: formatCsvOutput,
      yaml: formatYamlOutput,
      yml: formatYamlOutput,
      xml: formatXmlOutput,
      markdown: formatMarkdownOutput,
      md: formatMarkdownOutput,
      table: formatTableOutput,
      text: formatTextOutput,
      simple: formatSimpleOutput,
      html: formatHtmlReportOutput,
      'html-report': formatHtmlReportOutput,
    };

  const results: Array<{ format: OutputFormat; valid: boolean; message: string; bytes: number }> =
    [];
  for (const format of formats) {
    try {
      const output = formatters[format](probeData, { ...probeOptions, format });
      const validation = validateFormattedOutput(format, output);
      results.push({
        format,
        valid: validation.valid,
        message: validation.message,
        bytes: Buffer.byteLength(output, 'utf8'),
      });
    } catch (error) {
      results.push({
        format,
        valid: false,
        message: (error as Error).message,
        bytes: 0,
      });
    }
  }

  const allValid = results.every((entry) => entry.valid);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          schemaVersion: '1.0',
          format: 'format-verification',
          query: probeOptions.query,
          checkedAt: new Date().toISOString(),
          source: getSearxngUrl(),
          success: allValid,
          resultCount: probeData.results?.length ?? 0,
          formats: results,
        },
        null,
        2
      )
    );
  } else {
    console.log(
      colorize('\n╔════════════════════════════════════════════════════════════╗', 'cyan')
    );
    console.log(
      colorize('║              Formatter Verification                        ║', 'bold,brightGreen')
    );
    console.log(colorize('╚════════════════════════════════════════════════════════════╝', 'cyan'));
    console.log();
    console.log(`  Query: ${probeOptions.query}`);
    console.log(`  Source: ${getSearxngUrl()}`);
    console.log(`  Results: ${probeData.results?.length ?? 0}`);
    console.log();
    for (const entry of results) {
      const icon = entry.valid ? colorize('✓', 'green') : colorize('✗', 'red');
      console.log(
        `  ${icon} ${entry.format.padEnd(11)} ${String(entry.bytes).padStart(6)} bytes  ${entry.message}`
      );
    }
    console.log();
    console.log(
      allValid
        ? colorize(
            `Verification result: ${results.length}/${results.length} formats valid`,
            'green'
          )
        : colorize(
            `Verification result: ${results.filter((entry) => entry.valid).length}/${results.length} formats valid`,
            'red'
          )
    );
  }

  return allValid ? 0 : 1;
}

import { runMcpServer } from './mcp';

export async function main(): Promise<void> {
  setupExitHandlers();
  loadSettings();
  reloadSearxngUrl();
  const args = normalizeCommandArgs(process.argv.slice(2));

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    process.exit(0);
  }

  if (args[0] === '--version' || args[0] === '-v') {
    showVersion();
    process.exit(0);
  }

  if (args[0] === '--mcp') {
    await runMcpServer();
    return;
  }

  if (args[0] === '--setup') {
    await runSetupWizard();
    process.exit(0);
  }

  if (args[0] === '--setup-local') {
    const settings = applyLocalAgentDefaults();
    let connectionReady: boolean | null = null;
    let discoveryReady = false;
    try {
      connectionReady = await checkConnectionHealth();
    } catch {
      connectionReady = null;
    }
    try {
      await discoverInstance(true);
      discoveryReady = true;
    } catch {
      discoveryReady = false;
    }
    console.log(colorize('\n✓ Local agent defaults applied', 'green'));
    console.log(`  URL: ${settings.searxngUrl}`);
    console.log(`  Format: ${settings.defaultFormat}`);
    console.log(`  Limit: ${settings.defaultLimit}`);
    console.log(`  Force local routing: ${settings.forceLocalRouting}`);
    console.log(`  Force local agent routing: ${settings.forceLocalAgentRouting}`);
    if (connectionReady === null) {
      console.log('  Connection check: unavailable');
    } else {
      console.log(`  Connection check: ${connectionReady ? 'ready' : 'failed'}`);
    }
    console.log(`  Instance discovery cache: ${discoveryReady ? 'primed' : 'skipped'}`);
    process.exit(0);
  }

  if (args[0] === '--settings') {
    await showSettings();
    process.exit(0);
  }

  if (args[0] === '--settings-json') {
    const settings = loadSettings();
    console.log(
      JSON.stringify(
        {
          schemaVersion: '1.0',
          format: 'settings',
          checkedAt: new Date().toISOString(),
          settingsFile: SETTINGS_FILE,
          configDir: CONFIG_DIR,
          settings,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  if (args[0] === '--paths-json') {
    console.log(
      JSON.stringify(
        {
          schemaVersion: '1.0',
          format: 'paths',
          checkedAt: new Date().toISOString(),
          configDir: CONFIG_DIR,
          settingsFile: SETTINGS_FILE,
          files: {
            settings: SETTINGS_FILE,
            config: CONFIG_FILE,
            history: HISTORY_FILE,
            bookmarks: BOOKMARKS_FILE,
            presets: PRESETS_FILE,
            suggestions: SUGGESTIONS_FILE,
            cache: CACHE_FILE,
            engines: ENGINES_CACHE_FILE,
            setupComplete: SETUP_COMPLETE_FILE,
          },
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  if (args[0] === '--doctor' || args[0] === '--doctor-json') {
    const doctorExitCode = await runDoctor(args[0] === '--doctor-json');
    process.exit(doctorExitCode);
  }

  if (args[0] === '--verify-formats' || args[0] === '--verify-formats-json') {
    const asJson = args[0] === '--verify-formats-json';
    const query = args.slice(1).join(' ').trim();
    const verificationExitCode = await runFormatVerification(query, asJson);
    process.exit(verificationExitCode);
  }

  if (args[0] === '--schema' || args[0] === '--schema-json') {
    const requestedFormat = (args[1] ?? 'all').trim().toLowerCase();
    const schema = getFormatterSchemas(requestedFormat);
    if (!schema) {
      console.error(colorize(`Error: Unknown format "${requestedFormat}"`, 'red'));
      console.error(
        colorize(
          `Supported formats: all, ${getSupportedSchemaFormats().join(', ')}, md, yml, html, ndjson, simple`,
          'yellow'
        )
      );
      process.exit(1);
    }
    const asJson = args[0] === '--schema-json';
    if (asJson) {
      console.log(JSON.stringify(schema, null, 2));
      process.exit(0);
    }
    if ('formats' in schema) {
      console.log(
        colorize('\n╔════════════════════════════════════════════════════════════╗', 'cyan')
      );
      console.log(
        colorize(
          '║              Formatter Schema Catalog                      ║',
          'bold,brightGreen'
        )
      );
      console.log(
        colorize('╚════════════════════════════════════════════════════════════╝', 'cyan')
      );
      console.log();
      console.log(`  Schema version: ${schema.schemaVersion}`);
      console.log(`  Generated: ${schema.generatedAt}`);
      console.log(`  Formats: ${schema.formats.length}`);
      console.log();
      schema.formats.forEach((entry) => {
        const aliasText = entry.aliases.length > 0 ? ` (aliases: ${entry.aliases.join(', ')})` : '';
        console.log(colorize(`  ${entry.format}${aliasText}`, 'yellow,bold'));
        console.log(`    MIME: ${entry.mimeType}`);
        console.log(`    Extension: ${entry.fileExtension}`);
        console.log(`    Checks: ${entry.requiredChecks.join(' | ')}`);
      });
      console.log();
      console.log(colorize('Use --schema-json <format> for machine-readable JSON.', 'dim'));
      process.exit(0);
    }
    console.log(JSON.stringify(schema, null, 2));
    process.exit(0);
  }

  if (args[0] === '--validate-payload' || args[0] === '--validate-payload-json') {
    const asJson = args[0] === '--validate-payload-json';
    const rawFormat = (args[1] ?? '').trim();
    const format = normalizeValidationFormat(rawFormat);
    if (!format) {
      console.error(colorize('Error: --validate-payload requires a format argument', 'red'));
      process.exit(1);
    }
    const extraArgs = args.slice(2);
    let payloadPath: string | null = null;

    for (let i = 0; i < extraArgs.length; i++) {
      const token = extraArgs[i] ?? '';
      if (!token) continue;

      if (token === '--input' || token === '--file') {
        const next = extraArgs[i + 1];
        if (!next) {
          console.error(colorize(`Error: ${token} requires a file path`, 'red'));
          process.exit(1);
        }
        payloadPath = next;
        i++;
        continue;
      }

      if (token.startsWith('--input=')) {
        payloadPath = token.slice('--input='.length);
        continue;
      }
      if (token.startsWith('--file=')) {
        payloadPath = token.slice('--file='.length);
        continue;
      }

      if (token.startsWith('--')) {
        console.error(colorize(`Error: Unknown option for --validate-payload: ${token}`, 'red'));
        process.exit(1);
      }

      if (payloadPath === null) {
        payloadPath = token;
        continue;
      }

      console.error(
        colorize(`Error: Multiple payload inputs provided ("${payloadPath}" and "${token}")`, 'red')
      );
      process.exit(1);
    }

    if (payloadPath === '-') {
      payloadPath = null;
    }
    try {
      const payload = readValidationPayload(payloadPath);
      const validation = validateFormattedOutput(format, payload);
      if (asJson) {
        console.log(
          safeJsonStringify(
            {
              schemaVersion: '1.0',
              format: 'payload-validation',
              checkedAt: new Date().toISOString(),
              targetFormat: format,
              valid: validation.valid,
              message: validation.message,
              bytes: Buffer.byteLength(payload, 'utf8'),
              source: payloadPath ?? 'stdin',
            },
            2
          )
        );
      } else {
        const status = validation.valid ? colorize('VALID', 'green') : colorize('INVALID', 'red');
        console.log(`${status}: ${format} (${validation.message})`);
      }
      process.exit(validation.valid ? 0 : 1);
    } catch (error) {
      if (asJson) {
        console.log(
          safeJsonStringify(
            {
              schemaVersion: '1.0',
              format: 'payload-validation',
              checkedAt: new Date().toISOString(),
              targetFormat: format,
              valid: false,
              message: (error as Error).message,
              bytes: 0,
              source: payloadPath ?? 'stdin',
            },
            2
          )
        );
      } else {
        console.error(colorize(`Error: ${(error as Error).message}`, 'red'));
      }
      process.exit(1);
    }
  }

  if (args[0] === '--instance-info' || args[0] === '--instance-info-json') {
    const capabilities = await fetchInstanceCapabilities();
    if (args[0] === '--instance-info-json') {
      console.log(
        JSON.stringify(
          {
            schemaVersion: '1.0',
            format: 'instance-capabilities',
            checkedAt: new Date().toISOString(),
            source: getSearxngUrl(),
            ...capabilities,
          },
          null,
          2
        )
      );
      process.exit(0);
    }

    console.log(
      colorize('\n╔════════════════════════════════════════════════════════════╗', 'cyan')
    );
    console.log(
      colorize('║              SearXNG Instance Capabilities                 ║', 'bold,brightGreen')
    );
    console.log(colorize('╚════════════════════════════════════════════════════════════╝', 'cyan'));
    console.log();
    console.log(colorize('Instance:', 'yellow,bold'));
    console.log(`  Name: ${capabilities.instance.name}`);
    console.log(`  Version: ${capabilities.instance.version}`);
    console.log(`  API: ${capabilities.instance.api_version}`);
    console.log(`  Engines: ${capabilities.instance.engines_count}`);
    console.log(`  Categories: ${capabilities.instance.categories_count}`);
    console.log();
    console.log(colorize(`Categories (${capabilities.categories.length}):`, 'yellow,bold'));
    console.log(`  ${capabilities.categories.join(', ') || '(none)'}`);
    console.log();
    console.log(colorize(`Languages (${capabilities.languages.length}):`, 'yellow,bold'));
    console.log(`  ${capabilities.languages.join(', ') || '(none)'}`);
    console.log();
    console.log(colorize(`Plugins (${capabilities.plugins.length}):`, 'yellow,bold'));
    console.log(`  ${capabilities.plugins.join(', ') || '(none)'}`);
    console.log();
    console.log(colorize('Top Engines:', 'yellow,bold'));
    capabilities.engines.slice(0, 20).forEach((engine) => {
      console.log(
        `  - ${engine.name} [${engine.language}] categories: ${engine.categories.join(', ') || 'n/a'}`
      );
    });
    if (capabilities.engines.length > 20) {
      console.log(colorize(`  ...and ${capabilities.engines.length - 20} more`, 'dim'));
    }
    process.exit(0);
  }

  const setCommands = [
    '--set-url',
    '--set-local-url',
    '--set-limit',
    '--set-format',
    '--set-theme',
    '--set-engines',
    '--set-timeout',
    '--set-history',
    '--set-force-local-routing',
    '--set-force-local-agent-routing',
    '--set-max-history',
    '--set-param',
    '--set-params-json',
    '--set-params-query',
    '--unset-param',
    '--clear-params',
  ];

  if (setCommands.some((cmd) => args[0] === cmd || args[0]?.startsWith(cmd))) {
    const settingMap: Record<string, string> = {
      '--set-url': 'url',
      '--set-local-url': 'url',
      '--set-limit': 'limit',
      '--set-format': 'format',
      '--set-theme': 'theme',
      '--set-engines': 'engines',
      '--set-timeout': 'timeout',
      '--set-history': 'history',
      '--set-force-local-routing': 'forceLocalRouting',
      '--set-force-local-agent-routing': 'forceLocalAgentRouting',
      '--set-max-history': 'maxHistory',
      '--set-param': 'setParam',
      '--set-params-json': 'setParamsJson',
      '--set-params-query': 'setParamsQuery',
      '--unset-param': 'unsetParam',
      '--clear-params': 'clearParams',
    };
    const settingKey = settingMap[args[0] ?? ''];
    let value =
      args[0] === '--set-local-url'
        ? DEFAULT_SEARXNG_URL
        : args[0] === '--clear-params'
          ? '__clear__'
          : args[1];
    if (!value) {
      if (args[0] === '--set-engines') {
        value = 'none';
      } else {
        console.log(colorize(`Error: ${args[0]} requires a value`, 'red'));
        process.exit(1);
      }
    }
    if (
      args[0] === '--set-engines' &&
      (value === 'none' || value === 'clear' || value === 'null')
    ) {
      value = '';
    }
    updateSetting(settingKey ?? args[0]?.replace('--set-', ''), value);
    process.exit(0);
  }

  if (args[0] === '--bookmarks') {
    await discoverInstance();
    showBookmarks();
    process.exit(0);
  }

  if (args[0] === '--history') {
    showSearchHistory();
    process.exit(0);
  }

  if (args[0] === '--config') {
    manageConfig(args[1] ?? 'show');
    process.exit(0);
  }

  const cacheCommands = [
    '--cache',
    '--cache-status',
    '--cache-status-json',
    '--cache-list',
    '--cache-search',
    '--cache-inspect',
    '--cache-delete',
    '--cache-clear',
    '--cache-export',
    '--cache-import',
    '--cache-prune',
    '--cache-help',
    '--clear-cache',
  ];

  if (cacheCommands.some((cmd) => args[0] === cmd || args[0]?.startsWith(cmd))) {
    ensureCacheLoaded();
    if (args[0] === '--cache-help') {
      showCacheHelp();
      process.exit(0);
    }
    if (args[0] === '--cache-status' || args[0] === '--cache') {
      showCacheStatus();
      process.exit(0);
    }
    if (args[0] === '--cache-status-json') {
      const stats = getCacheStats();
      console.log(
        JSON.stringify(
          {
            schemaVersion: '1.0',
            format: 'cache-status',
            checkedAt: new Date().toISOString(),
            source: getSearxngUrl(),
            configDir: CONFIG_DIR,
            settingsFile: SETTINGS_FILE,
            ...stats,
          },
          null,
          2
        )
      );
      process.exit(0);
    }
    if (args[0] === '--clear-cache' || args[0] === '--cache-clear') {
      clearCache();
      console.log(colorize('\n✓ Cache cleared', 'green'));
      process.exit(0);
    }
    if (args[0] === '--cache-list') {
      const limit = parseInt(args[1] ?? '50', 10);
      showCacheList(isNaN(limit) ? 50 : limit, 0);
      process.exit(0);
    }
    if (args[0] === '--cache-search') {
      if (!args[1]) {
        console.log(colorize('Error: --cache-search requires a search term', 'red'));
        process.exit(1);
      }
      showCacheSearch(args[1]);
      process.exit(0);
    }
    if (args[0] === '--cache-inspect') {
      const num = parseInt(args[1] ?? '0', 10);
      if (isNaN(num) || num < 1) {
        console.log(colorize('Error: --cache-inspect requires a valid entry number', 'red'));
        process.exit(1);
      }
      inspectCacheEntry(num);
      process.exit(0);
    }
    if (args[0] === '--cache-delete') {
      const num = parseInt(args[1] ?? '0', 10);
      if (isNaN(num) || num < 1) {
        console.log(colorize('Error: --cache-delete requires a valid entry number', 'red'));
        process.exit(1);
      }
      if (deleteCacheEntry(num)) {
        console.log(colorize(`\n✓ Cache entry #${num} deleted`, 'green'));
      } else {
        console.log(colorize(`\n✗ Cache entry #${num} not found`, 'red'));
      }
      process.exit(0);
    }
    if (args[0] === '--cache-export') {
      if (!args[1]) {
        console.log(colorize('Error: --cache-export requires a file path', 'red'));
        process.exit(1);
      }
      const result = exportCache(args[1]);
      if (result.success) {
        console.log(
          colorize(`\n✓ Exported ${result.entries} cache entries to ${result.file}`, 'green')
        );
      } else {
        console.log(colorize(`\n✗ Export failed: ${result.error}`, 'red'));
      }
      process.exit(0);
    }
    if (args[0] === '--cache-import') {
      if (!args[1]) {
        console.log(colorize('Error: --cache-import requires a file path', 'red'));
        process.exit(1);
      }
      const result = importCache(args[1]);
      if (result.success) {
        console.log(
          colorize(`\n✓ Imported ${result.imported} entries (${result.skipped} skipped)`, 'green')
        );
      } else {
        console.log(colorize(`\n✗ Import failed: ${result.error}`, 'red'));
      }
      process.exit(0);
    }
    if (args[0] === '--cache-prune') {
      const days = parseInt(args[1] ?? '0', 10);
      if (isNaN(days) || days < 1) {
        console.log(colorize('Error: --cache-prune requires a number of days', 'red'));
        process.exit(1);
      }
      const result = pruneCache(days * 24 * 60 * 60 * 1000);
      console.log(
        colorize(`\n✓ Pruned ${result.pruned} entries, ${result.remaining} remaining`, 'green')
      );
      process.exit(0);
    }
  }

  if (args[0] === '--health' || args[0] === '--health-check') {
    const start = Date.now();
    let health = false;
    let latency = 0;
    const currentUrl = getSearxngUrl();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${currentUrl}/config`, {
        headers: { 'User-Agent': `searxng-cli/${VERSION}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      health = response.ok;
      latency = Date.now() - start;
    } catch {
      latency = Date.now() - start;
    }
    console.log(
      colorize('\n╔════════════════════════════════════════════════════════════╗', 'cyan')
    );
    console.log(
      colorize('║              Connection Health Check                       ║', 'bold,brightGreen')
    );
    console.log(colorize('╚════════════════════════════════════════════════════════════╝', 'cyan'));
    console.log();
    console.log(`  Server: ${currentUrl}`);
    console.log(
      `  Status: ${health ? colorize('✓ Healthy', 'green') : colorize('✗ Unhealthy', 'red')}`
    );
    console.log(`  Latency: ${latency}ms`);
    console.log(`  Type: ${isLocalInstance() ? 'Local Network' : 'Remote'}`);
    process.exit(health ? 0 : 1);
  }

  if (!isSetupComplete() && process.stdout.isTTY && process.stdin.isTTY && !process.env.CI) {
    await runSetupWizard();
  }

  if (args[0] === '--test') {
    ensureCacheLoaded();
    console.log(
      colorize('\n╔════════════════════════════════════════════════════════════╗', 'cyan')
    );
    console.log(
      colorize('║              SearXNG CLI Test Suite                        ║', 'bold,brightGreen')
    );
    console.log(colorize('╚════════════════════════════════════════════════════════════╝', 'cyan'));
    console.log();

    let passed = 0;
    let failed = 0;

    const test = async (name: string, fn: () => Promise<void>): Promise<void> => {
      process.stdout.write(`  ${name}... `);
      try {
        await fn();
        console.log(colorize('✓ PASS', 'green'));
        passed++;
      } catch (err) {
        console.log(colorize(`✗ FAIL: ${(err as Error).message}`, 'red'));
        failed++;
      }
    };

    const splitCsvRow = (row: string): string[] => {
      const cells: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '"') {
          const next = row[i + 1];
          if (inQuotes && next === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }
        if (ch === ',' && !inQuotes) {
          cells.push(current);
          current = '';
          continue;
        }
        current += ch;
      }
      cells.push(current);
      return cells;
    };

    const defaultTestOptions: SearchOptions = {
      query: '',
      limit: 3,
      format: 'toon',
      noCache: true,
      silent: true,
      page: 1,
      safeSearch: 0,
      engines: null,
      lang: null,
      timeRange: null,
      category: null,
      timeout: DEFAULT_TIMEOUT,
      retries: MAX_RETRIES,
      verbose: false,
      output: null,
      unescape: true,
      autoformat: true,
      score: false,
      interactive: false,
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
      pretty: false,
      confirm: false,
      agent: false,
      analyze: false,
      cacheStatus: false,
      extract: null,
      sentiment: false,
      structured: false,
      citation: false,
      rawContent: false,
      exportEmbeddings: false,
      autoRefine: false,
      fetchContent: false,
      systemPrompt: null,
      validateOutput: false,
      strict: false,
      refreshEngines: false,
      instanceInfo: false,
      instanceInfoJson: false,
    };

    const currentUrl = getSearxngUrl();
    await test('Connection Health', async () => {
      const response = await rateLimitedFetch(`${currentUrl}/config`, {
        headers: { 'User-Agent': `searxng-cli/${VERSION}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    });

    await test('Instance Discovery', async () => {
      await discoverInstance();
    });

    await test('Search Functionality', async () => {
      const options = { ...defaultTestOptions, query: 'test' };
      const url = buildUrl(options);
      const response = await fetchWithRetry(url, options, 2);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as SearchResponse;
      if (!data.results || !Array.isArray(data.results)) throw new Error('Invalid response format');
    });

    await test('TOON Format Output', async () => {
      const options = { ...defaultTestOptions, query: 'nodejs' };
      const url = buildUrl(options);
      const response = await fetchWithRetry(url, options, 2);
      const data = (await response.json()) as SearchResponse;
      const output = formatToonOutput(data, options);
      const parsed = decodeToon(output) as { q?: string; results?: unknown[] };
      if (!parsed || typeof parsed !== 'object') throw new Error('TOON decode failed');
      if (parsed.q !== options.query) throw new Error('TOON q mismatch');
      if (!Array.isArray(parsed.results)) throw new Error('TOON results must be an array');
    });

    await test('JSON Format Output', async () => {
      const options = { ...defaultTestOptions, query: 'test', format: 'json' as const };
      const url = buildUrl(options);
      const response = await fetchWithRetry(url, options, 2);
      const data = (await response.json()) as SearchResponse;
      const jsonStr = formatJsonOutput(data, options);
      const parsed = JSON.parse(jsonStr) as { query?: string; results?: unknown[] };
      if (parsed.query !== options.query) throw new Error('JSON query mismatch');
      if (!Array.isArray(parsed.results)) throw new Error('JSON results must be an array');
    });

    await test('CSV Format Output', async () => {
      const options = { ...defaultTestOptions, query: 'test', format: 'csv' as const };
      const url = buildUrl(options);
      const response = await fetchWithRetry(url, options, 2);
      const data = (await response.json()) as SearchResponse;
      const csv = formatCsvOutput(data, options);
      const rows = csv.split('\n').filter((line) => line.trim().length > 0);
      if (rows.length === 0) throw new Error('CSV empty output');
      if (rows[0] !== 'i,title,url,engine,score,text') throw new Error('CSV header mismatch');
      for (const row of rows.slice(1)) {
        const cells = splitCsvRow(row);
        if (cells.length !== 6) throw new Error(`CSV row has ${cells.length} columns`);
      }
    });

    await test('YAML Format Output', async () => {
      const options = { ...defaultTestOptions, query: 'test', format: 'yaml' as const };
      const url = buildUrl(options);
      const response = await fetchWithRetry(url, options, 2);
      const data = (await response.json()) as SearchResponse;
      const yaml = formatYamlOutput(data, options);
      if (!yaml.includes("query: 'test'")) throw new Error('YAML query missing');
      if (!yaml.includes('results:')) throw new Error('YAML results key missing');
      const itemCount = (yaml.match(/\n  - i: /g) ?? []).length;
      const expectedCount = Math.min(options.limit, data.results?.length ?? 0);
      if (itemCount !== expectedCount) throw new Error('YAML item count mismatch');
    });

    await test('XML Format Output', async () => {
      const options = { ...defaultTestOptions, query: 'test', format: 'xml' as const };
      const url = buildUrl(options);
      const response = await fetchWithRetry(url, options, 2);
      const data = (await response.json()) as SearchResponse;
      const xml = formatXmlOutput(data, options);
      if (!xml.startsWith('<?xml version="1.0"')) throw new Error('XML declaration missing');
      if (!xml.includes('<search ')) throw new Error('XML root missing');
      if (!xml.includes('</search>')) throw new Error('XML closing tag missing');
      const count = (xml.match(/<result index="/g) ?? []).length;
      const expectedCount = Math.min(options.limit, data.results?.length ?? 0);
      if (count !== expectedCount) throw new Error('XML result count mismatch');
    });

    await test('Markdown Format Output', async () => {
      const options = { ...defaultTestOptions, query: 'test', format: 'markdown' as const };
      const url = buildUrl(options);
      const response = await fetchWithRetry(url, options, 2);
      const data = (await response.json()) as SearchResponse;
      const markdown = formatMarkdownOutput(data, options);
      const validation = validateFormattedOutput('markdown', markdown);
      if (!validation.valid) throw new Error(validation.message);
    });

    await test('Table Format Output', async () => {
      const options = { ...defaultTestOptions, query: 'test', format: 'table' as const };
      const url = buildUrl(options);
      const response = await fetchWithRetry(url, options, 2);
      const data = (await response.json()) as SearchResponse;
      const table = formatTableOutput(data, options);
      const validation = validateFormattedOutput('table', table);
      if (!validation.valid) throw new Error(validation.message);
    });

    await test('Text Format Output', async () => {
      const options = { ...defaultTestOptions, query: 'test', format: 'text' as const };
      const url = buildUrl(options);
      const response = await fetchWithRetry(url, options, 2);
      const data = (await response.json()) as SearchResponse;
      const text = formatTextOutput(data, options);
      const validation = validateFormattedOutput('text', text);
      if (!validation.valid) throw new Error(validation.message);
    });

    await test('HTML Report Output', async () => {
      const options = { ...defaultTestOptions, query: 'test', format: 'html-report' as const };
      const url = buildUrl(options);
      const response = await fetchWithRetry(url, options, 2);
      const data = (await response.json()) as SearchResponse;
      const html = formatHtmlReportOutput(data, options);
      const validation = validateFormattedOutput('html-report', html);
      if (!validation.valid) throw new Error(validation.message);
    });

    await test('Cache Write', async () => {
      const testQuery = 'cache-test-' + Date.now();
      const testOpts = {
        query: testQuery,
        format: 'toon' as const,
        page: 1,
        engines: null,
        lang: null,
        timeRange: null,
        category: null,
        safeSearch: 0 as const,
      };
      const testData: SearchResponse = {
        results: [{ title: 'Test', url: 'https://example.com' }],
        query: testQuery,
      };
      setCachedResult(testQuery, testOpts as SearchOptions, testData);
      const cached = getCachedResult(testQuery, testOpts as SearchOptions);
      if (!cached) throw new Error('Cache write failed');
    });

    await test('Cache Read', async () => {
      const testQuery = 'cache-read-' + Date.now();
      const testOpts = {
        query: testQuery,
        format: 'toon' as const,
        page: 1,
        engines: null,
        lang: null,
        timeRange: null,
        category: null,
        safeSearch: 0 as const,
      };
      const testData: SearchResponse = {
        results: [{ title: 'Test Read', url: 'https://example.com/read' }],
        query: testQuery,
      };
      setCachedResult(testQuery, testOpts as SearchOptions, testData);
      const cached = getCachedResult(testQuery, testOpts as SearchOptions);
      if (!cached || !cached._cached) throw new Error('Cache read failed or missing _cached flag');
    });

    await test('Cache Stats', async () => {
      const stats = getCacheStats();
      if (typeof stats.entries !== 'number') throw new Error('Invalid cache stats');
      if (!stats.persistent) throw new Error('Persistent cache not enabled');
    });

    await test('Result Deduplication', async () => {
      const results = [
        { url: 'https://example.com/1', title: 'Test 1' },
        { url: 'https://example.com/1', title: 'Test 1 Duplicate' },
        { url: 'https://example.com/2', title: 'Test 2' },
      ];
      const deduped = deduplicateResults(results);
      if (deduped.length !== 2) throw new Error(`Expected 2 results, got ${deduped.length}`);
    });

    await test('Query Expansion', async () => {
      const expanded = expandQuery('!gh nodejs repo');
      if (expanded.engines !== 'github') throw new Error('Query expansion failed for !gh');
    });

    await test('URL Building', async () => {
      const options = { ...defaultTestOptions, query: 'test query', engines: 'google,bing' };
      const url = buildUrl(options);
      if (!url.toString().includes('engines=google%2Cbing'))
        throw new Error('URL engines param missing');
      if (!url.toString().includes('q=test+query')) throw new Error('URL query param missing');
    });

    await test('Infobox & Suggestions in TOON', async () => {
      const options = { ...defaultTestOptions, query: 'javascript', compact: false };
      const url = buildUrl(options);
      const response = await fetchWithRetry(url, options, 2);
      const data = (await response.json()) as SearchResponse;
      const output = formatToonOutput(data, options);
      if (!output.includes('q:')) throw new Error('Missing q field in TOON output');
    });

    console.log();
    console.log(
      colorize(`Results: ${passed} passed, ${failed} failed`, failed === 0 ? 'green' : 'yellow')
    );
    process.exit(failed > 0 ? 1 : 0);
  }

  const options = parseArgs(args);

  if (options.requestJson) {
    if (!options.query.trim()) {
      console.error(colorize('Error: --request-json requires a search query', 'red'));
      process.exit(1);
    }
    enforceLocalRouting(options);
    const resolvedUrl = buildUrl(options);
    console.log(
      safeJsonStringify(
        {
          schemaVersion: '1.0',
          format: 'request',
          generatedAt: new Date().toISOString(),
          source: getSearxngUrl(),
          agentMode: options.agent,
          query: options.query,
          request: {
            method: 'GET',
            url: resolvedUrl.toString(),
            params: toPlainParams(resolvedUrl.searchParams),
          },
          options: {
            format: options.format,
            limit: options.limit,
            page: options.page,
            safeSearch: options.safeSearch,
            timeRange: options.timeRange,
            category: options.category,
            engines: options.engines,
            lang: options.lang,
            timeout: options.timeout,
            retries: options.retries,
            offlineFirst: options.offlineFirst ?? false,
            strict: options.strict,
            validateOutput: options.validateOutput,
            dedup: options.dedup,
            searxngParams: options.searxngParams ?? {},
          },
        },
        2
      )
    );
    process.exit(0);
  }

  if (options.suggestions) {
    const suggestions = loadSuggestions();
    if (options.format === 'json' || options.format === 'raw') {
      console.log(
        safeJsonStringify(
          {
            schemaVersion: '1.0',
            format: 'suggestions',
            popular: suggestions.popular,
            recent: suggestions.recent,
          },
          options.compact ? 0 : 2
        )
      );
    } else {
      console.log(colorize('\nLocal Suggestions', 'cyan,bold'));
      console.log();
      console.log(colorize('Recent:', 'yellow,bold'));
      if (suggestions.recent.length === 0) {
        console.log(colorize('  (none)', 'dim'));
      } else {
        suggestions.recent.slice(0, 20).forEach((query, index) => {
          console.log(`  ${String(index + 1).padStart(2)}. ${query}`);
        });
      }
      console.log();
      console.log(colorize('Popular:', 'yellow,bold'));
      if (suggestions.popular.length === 0) {
        console.log(colorize('  (none)', 'dim'));
      } else {
        suggestions.popular.slice(0, 20).forEach((query, index) => {
          console.log(`  ${String(index + 1).padStart(2)}. ${query}`);
        });
      }
    }
    process.exit(0);
  }

  if (options.listPresets) {
    const presets = loadPresets();
    const entries = Object.entries(presets).sort((a, b) => a[0].localeCompare(b[0]));
    if (options.format === 'json' || options.format === 'raw') {
      console.log(
        safeJsonStringify(
          {
            schemaVersion: '1.0',
            format: 'presets',
            count: entries.length,
            presets: entries.map(([name, preset]) => ({
              name,
              createdAt:
                typeof preset.createdAt === 'string'
                  ? preset.createdAt
                  : ((preset as Record<string, unknown>).createdAt ?? null),
              preset,
            })),
          },
          options.compact ? 0 : 2
        )
      );
    } else {
      console.log(colorize('\nSaved Presets', 'cyan,bold'));
      if (entries.length === 0) {
        console.log(colorize('No presets found.', 'dim'));
      } else {
        entries.forEach(([name, preset], index) => {
          const createdAt =
            typeof preset.createdAt === 'string'
              ? preset.createdAt
              : String((preset as Record<string, unknown>).createdAt ?? 'unknown');
          console.log(`  ${String(index + 1).padStart(2)}. ${name} (${createdAt})`);
        });
      }
    }
    process.exit(0);
  }

  if (options.preset) {
    const presets = loadPresets();
    const preset = presets[options.preset];
    if (!preset) {
      console.error(colorize(`Error: Preset "${options.preset}" not found`, 'red'));
      process.exit(1);
    }
    applyPresetToOptions(
      options,
      preset as Record<string, unknown>,
      getExplicitPresetOverrideKeys(args)
    );
    if (options.verbose && !options.silent) {
      console.error(colorize(`✓ Loaded preset: ${options.preset}`, 'green'));
    }
  }

  if (options.savePreset) {
    savePresetFromOptions(options.savePreset, options);
    console.log(colorize(`\n✓ Preset saved: ${options.savePreset}`, 'green'));
    if (!options.query.trim()) {
      process.exit(0);
    }
  }

  if (options.autocomplete) {
    const code = await runAutocomplete(options);
    process.exit(code);
  }

  if (options.multiSearch) {
    const queries = parseMultiQueries(options.multiSearch);
    if (queries.length === 0) {
      console.error(colorize('Error: --multi requires at least one query', 'red'));
      process.exit(1);
    }

    let strictFailureCount = 0;
    for (const query of queries) {
      const runOptions: SearchOptions = { ...options, query, multiSearch: null };
      if (queries.length > 1 && options.format !== 'json' && options.format !== 'raw') {
        console.log(colorize(`\n=== ${query} ===`, 'cyan,bold'));
      }
      addToHistory(query);
      updateSuggestions(query);
      const result = await performSearch(runOptions);
      if (!result) {
        process.exit(1);
      }
      if (runOptions.strict && (result.results?.length ?? 0) === 0) {
        strictFailureCount++;
        if (!runOptions.silent) {
          console.error(colorize(`Strict mode: no results for query "${query}"`, 'red'));
        }
      }
    }
    process.exit(strictFailureCount > 0 ? 2 : 0);
  }

  if (!options.query && !options.interactive) {
    console.error(colorize('Error: No search query provided', 'red'));
    process.exit(1);
  }

  await discoverInstance(options.refreshEngines);

  const expanded = expandQuery(options.query);
  if (expanded.query !== options.query) {
    options.query = expanded.query;
    if (expanded.engines && !options.engines) options.engines = expanded.engines;
    if (expanded.category && !options.category) options.category = expanded.category;
  }

  addToHistory(options.query);
  updateSuggestions(options.query);
  const result = await performSearch(options);
  if (!result) {
    process.exit(1);
  }
  if (options.strict && (result.results?.length ?? 0) === 0) {
    if (!options.silent) {
      console.error(colorize('Strict mode: no results returned', 'red'));
    }
    process.exit(2);
  }
}
