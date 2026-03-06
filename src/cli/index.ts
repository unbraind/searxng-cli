import * as fs from 'fs';
import * as readline from 'readline';
import { spawn } from 'child_process';
import {
  SEARXNG_URL,
  getSearxngUrl,
  VERSION,
  isLocalInstance,
  DEFAULT_TIMEOUT,
  MAX_RETRIES,
  RATE_LIMIT_DELAY,
  LRU_CACHE_SIZE,
  ENGINE_GROUPS,
  VALID_CATEGORIES,
  VALID_TIME_RANGES,
  VALID_FORMATS,
  VALID_SAFE_LEVELS,
  CONFIG_DIR,
  setTheme,
  COLOR_THEMES,
} from '../config';
import { colorize, truncate, formatDuration } from '../utils';
import { resultCache } from '../cache';
import { circuitBreaker, getConnectionHealth } from '../http';
import { loadConfig, loadSettings } from '../storage';
import type { SearchOptions, OutputFormat, SafeSearchLevel, TimeRange, ColorTheme } from '../types';

const IS_PIPE_MODE = !process.stdout.isTTY;

function assignSearxngParams(options: SearchOptions, params: Record<string, string>): void {
  if (!options.searxngParams) {
    options.searxngParams = {};
  }
  for (const [key, value] of Object.entries(params)) {
    if (key.trim()) {
      options.searxngParams[key] = value;
    }
  }
}

function parseSxBoolean(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return 'true';
  if (['0', 'false', 'no', 'off'].includes(normalized)) return 'false';
  return null;
}

function normalizeSxCsvParam(value: string): string | null {
  const normalized = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(',');
  return normalized.length > 0 ? normalized : null;
}

function parseSxKeyValue(raw: string): { key: string; value: string } | null {
  const separatorIndex = raw.indexOf('=');
  if (separatorIndex <= 0) return null;
  const key = raw.slice(0, separatorIndex).trim();
  const value = raw.slice(separatorIndex + 1);
  if (!key) return null;
  return { key, value };
}

function parseSxQueryString(raw: string): Record<string, string> {
  const params = new URLSearchParams(raw.trim());
  const normalized: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (key.trim()) {
      normalized[key] = value;
    }
  }
  return normalized;
}

function parseSearxngParamsObject(raw: string, source: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(colorize(`Error: Invalid JSON in ${source}: ${(error as Error).message}`, 'red'));
    process.exit(1);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error(colorize(`Error: ${source} must be a JSON object`, 'red'));
    process.exit(1);
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!key.trim()) {
      continue;
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      normalized[key] = String(value);
      continue;
    }
    console.error(
      colorize(`Error: ${source} key "${key}" must be string/number/boolean/null`, 'red')
    );
    process.exit(1);
  }
  return normalized;
}

export function createDefaultOptions(): SearchOptions {
  const config = loadConfig();
  const settings = loadSettings();
  const defaultSearxngParams =
    settings.defaultSearxngParams && typeof settings.defaultSearxngParams === 'object'
      ? { ...settings.defaultSearxngParams }
      : undefined;
  return {
    query: '',
    format: settings.defaultFormat ?? config.defaultFormat ?? 'toon',
    engines: settings.defaultEngines ?? config.defaultEngines ?? null,
    lang: null,
    page: 1,
    safeSearch: 0,
    timeRange: null,
    category: settings.defaultCategory ?? config.defaultCategory ?? null,
    limit: settings.defaultLimit ?? config.defaultLimit ?? 10,
    timeout: settings.defaultTimeout ?? config.defaultTimeout ?? DEFAULT_TIMEOUT,
    verbose: false,
    output: null,
    unescape: settings.autoUnescape ?? config.autoUnescape !== false,
    autoformat: settings.autoFormat ?? config.autoFormat !== false,
    score: settings.showScores ?? config.showScores ?? false,
    interactive: false,
    noCache: false,
    retries: MAX_RETRIES,
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
    pipe: IS_PIPE_MODE,
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
    theme: settings.theme ?? config.theme ?? 'default',
    compact: false,
    metadata: false,
    urlsOnly: false,
    titlesOnly: false,
    autocomplete: false,
    proxy: process.env.HTTP_PROXY ?? process.env.HTTPS_PROXY ?? null,
    insecure: false,
    health: false,
    watch: false,
    silent: false,
    pretty: process.stdout.isTTY ?? false,
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
    offlineFirst: false,
    requestJson: false,
    refreshEngines: false,
    instanceInfo: false,
    instanceInfoJson: false,
    searxngParams: defaultSearxngParams,
    estimateTokens: false,
    maxTokens: null,
  };
}

export function parseArgs(args: string[]): SearchOptions {
  const config = loadConfig();
  const settings = loadSettings();
  const options = createDefaultOptions();

  let i = 0;
  const queryParts: string[] = [];

  const parseValue = <T>(arg: string, argName: string, setter: (value: string) => void): void => {
    let value: string | undefined;
    if (arg.includes('=')) {
      value = arg.split('=')[1];
    } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
      value = args[++i];
    }
    if (value !== undefined) setter(value);
  };

  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
    if (arg === '--version' || arg === '-v') {
      showVersion();
      process.exit(0);
    }
    if (arg === '--verbose' || arg === '-V') {
      options.verbose = true;
      i++;
      continue;
    }
    if (arg === '--stats' || arg === '-S') {
      options.stats = true;
      i++;
      continue;
    }
    if (arg === '--interactive' || arg === '-i') {
      options.interactive = true;
      i++;
      continue;
    }
    if (arg === '--no-cache' || arg === '-C') {
      options.noCache = true;
      i++;
      continue;
    }
    if (arg === '--raw' || arg === '-R') {
      options.raw = true;
      options.format = 'raw';
      i++;
      continue;
    }
    if (arg === '--pipe') {
      options.pipe = true;
      options.format = 'json';
      i++;
      continue;
    }
    if (arg === '--stream') {
      options.stream = true;
      options.jsonl = true;
      i++;
      continue;
    }
    if (arg === '--jsonl') {
      options.jsonl = true;
      options.format = 'jsonl';
      i++;
      continue;
    }
    if (arg === '--ndjson') {
      options.jsonl = true;
      options.format = 'jsonl';
      i++;
      continue;
    }
    if (arg === '--rank') {
      options.rank = true;
      options.sort = true;
      i++;
      continue;
    }
    if (arg === '--compact') {
      options.compact = true;
      i++;
      continue;
    }
    if (arg === '--metadata') {
      options.metadata = true;
      i++;
      continue;
    }
    if (arg === '--urls') {
      options.urlsOnly = true;
      i++;
      continue;
    }
    if (arg === '--titles') {
      options.titlesOnly = true;
      i++;
      continue;
    }
    if (arg === '--has-image') {
      options.hasImage = true;
      i++;
      continue;
    }
    if (arg === '--autocomplete' || arg === '--auto') {
      options.autocomplete = true;
      i++;
      continue;
    }
    if (arg === '--health-check') {
      options.health = true;
      i++;
      continue;
    }
    if (arg === '--watch') {
      options.watch = true;
      i++;
      continue;
    }
    if (arg === '--insecure' || arg === '-k') {
      options.insecure = true;
      i++;
      continue;
    }
    if (arg === '--silent' || arg === '-s') {
      options.silent = true;
      options.verbose = false;
      i++;
      continue;
    }
    if (arg === '--pretty' || arg === '-P') {
      options.pretty = true;
      i++;
      continue;
    }
    if (arg === '--no-pretty') {
      options.pretty = false;
      i++;
      continue;
    }
    if (arg === '-y' || arg === '--yes') {
      options.confirm = true;
      i++;
      continue;
    }
    if (arg === '--json') {
      options.format = 'json';
      options.compact = true;
      i++;
      continue;
    }
    if (arg === '--toon') {
      options.format = 'toon';
      i++;
      continue;
    }
    if (arg === '--csv') {
      options.format = 'csv';
      i++;
      continue;
    }
    if (arg === '--yaml' || arg === '--yml') {
      options.format = 'yaml';
      i++;
      continue;
    }
    if (arg === '--xml') {
      options.format = 'xml';
      i++;
      continue;
    }
    if (arg === '--markdown' || arg === '--md') {
      options.format = 'markdown';
      i++;
      continue;
    }
    if (arg === '--table') {
      options.format = 'table';
      i++;
      continue;
    }
    if (arg === '--text') {
      options.format = 'text';
      i++;
      continue;
    }
    if (arg === '--simple') {
      options.format = 'simple';
      i++;
      continue;
    }
    if (arg === '--html' || arg === '--html-report') {
      options.format = 'html-report';
      i++;
      continue;
    }
    if (arg === '--agent' || arg === '--ai') {
      options.agent = true;
      options.format = 'toon';
      options.compact = true;
      options.pretty = false;
      options.validateOutput = true;
      i++;
      continue;
    }
    if (arg === '--estimate-tokens') {
      options.estimateTokens = true;
      i++;
      continue;
    }
    if (arg === '--max-tokens') {
      parseValue(arg, '--max-tokens', (val) => {
        const num = parseInt(val, 10);
        if (!isNaN(num) && num > 0) options.maxTokens = num;
      });
      continue;
    }
    if (arg === '--agent-json') {
      options.agent = true;
      options.format = 'json';
      options.compact = true;
      options.pretty = false;
      options.validateOutput = true;
      i++;
      continue;
    }
    if (arg === '--agent-ci') {
      options.agent = true;
      options.format = 'toon';
      options.compact = true;
      options.pretty = false;
      options.validateOutput = true;
      options.strict = true;
      options.offlineFirst = true;
      i++;
      continue;
    }
    if (arg === '--analyze' || arg === '--analysis') {
      options.analyze = true;
      i++;
      continue;
    }
    if (arg === '--structured' || arg === '--ld') {
      options.structured = true;
      options.format = 'json';
      i++;
      continue;
    }
    if (arg === '--sentiment') {
      options.sentiment = true;
      options.analyze = true;
      i++;
      continue;
    }
    if (arg === '--citation' || arg === '--cite') {
      options.citation = true;
      i++;
      continue;
    }
    if (arg === '--raw-content') {
      options.rawContent = true;
      i++;
      continue;
    }
    if (arg === '--export-embeddings') {
      options.exportEmbeddings = true;
      i++;
      continue;
    }
    if (arg === '--auto-refine') {
      options.autoRefine = true;
      i++;
      continue;
    }
    if (arg === '--fetch-content') {
      options.fetchContent = true;
      i++;
      continue;
    }
    if (arg === '--system-prompt' || arg.startsWith('--system-prompt=')) {
      parseValue(arg, '--system-prompt', (v) => {
        options.systemPrompt = v;
      });
      i++;
      continue;
    }
    if (arg === '--score') {
      options.score = true;
      i++;
      continue;
    }
    if (arg === '--autoformat' || arg === '-a') {
      options.autoformat = true;
      i++;
      continue;
    }
    if (arg === '--no-unescape') {
      options.unescape = false;
      i++;
      continue;
    }
    if (arg === '--quick' || arg === '-q') {
      options.quick = true;
      options.limit = 5;
      options.compact = true;
      options.pretty = false;
      i++;
      continue;
    }
    if (arg === '--summary') {
      options.summary = true;
      i++;
      continue;
    }
    if (arg === '--no-dedup') {
      options.dedup = false;
      i++;
      continue;
    }
    if (arg === '--sort') {
      options.sort = true;
      options.score = true;
      i++;
      continue;
    }
    if (arg === '--engines-refresh') {
      options.refreshEngines = true;
      i++;
      continue;
    }
    if (arg === '--validate' || arg === '--validate-output') {
      options.validateOutput = true;
      i++;
      continue;
    }
    if (arg === '--strict' || arg === '--fail-on-empty') {
      options.strict = true;
      i++;
      continue;
    }
    if (arg === '--offline-first' || arg === '--cache-only') {
      options.offlineFirst = true;
      i++;
      continue;
    }
    if (arg === '--request-json') {
      options.requestJson = true;
      i++;
      continue;
    }
    if (arg === '--instance-info') {
      options.instanceInfo = true;
      i++;
      continue;
    }
    if (arg === '--instance-info-json') {
      options.instanceInfo = true;
      options.instanceInfoJson = true;
      i++;
      continue;
    }
    if (arg === '--info') {
      options.showInfo = true;
      i++;
      continue;
    }
    if (arg === '--test') {
      options.runTest = true;
      i++;
      continue;
    }
    if (arg === '--presets') {
      options.listPresets = true;
      i++;
      continue;
    }
    if (arg === '--suggestions') {
      options.suggestions = true;
      i++;
      continue;
    }
    if (arg === '--config') {
      options.config = i + 1 < args.length ? args[++i] : 'show';
      i++;
      continue;
    }

    if (arg.startsWith('--proxy')) {
      parseValue(arg, '--proxy', (v) => (options.proxy = v));
      i++;
      continue;
    }
    if (arg === '--param' || arg.startsWith('--param=')) {
      let raw = '';
      if (arg.startsWith('--param=')) {
        raw = arg.split('=').slice(1).join('=');
      } else if (i + 1 < args.length) {
        raw = args[++i] ?? '';
      }
      const parsed = parseSxKeyValue(raw);
      if (!parsed) {
        console.error(colorize(`Error: Invalid --param "${raw}". Expected key=value`, 'red'));
        process.exit(1);
      }
      if (!options.searxngParams) {
        options.searxngParams = {};
      }
      options.searxngParams[parsed.key] = parsed.value;
      i++;
      continue;
    }
    if (
      arg === '--sx' ||
      arg === '--sx-param' ||
      arg.startsWith('--sx=') ||
      arg.startsWith('--sx-param=')
    ) {
      let raw = '';
      if (arg.includes('=')) {
        raw = arg.split('=').slice(1).join('=');
      } else if (i + 1 < args.length) {
        raw = args[++i] ?? '';
      }
      const parsed = parseSxKeyValue(raw);
      if (!parsed) {
        console.error(
          colorize(
            `Error: Invalid ${arg.startsWith('--sx-param') ? '--sx-param' : '--sx'} "${raw}". Expected key=value`,
            'red'
          )
        );
        process.exit(1);
      }
      assignSearxngParams(options, { [parsed.key]: parsed.value });
      i++;
      continue;
    }
    if (
      arg === '--sx-query' ||
      arg === '--sx-params' ||
      arg.startsWith('--sx-query=') ||
      arg.startsWith('--sx-params=')
    ) {
      let raw = '';
      if (arg.includes('=')) {
        raw = arg.split('=').slice(1).join('=');
      } else if (i + 1 < args.length) {
        raw = args[++i] ?? '';
      }
      if (!raw.trim()) {
        console.error(colorize('Error: --sx-query requires URL-style params (k=v&k2=v2)', 'red'));
        process.exit(1);
      }
      const parsed = parseSxQueryString(raw);
      if (Object.keys(parsed).length === 0) {
        console.error(colorize('Error: --sx-query did not contain valid parameters', 'red'));
        process.exit(1);
      }
      assignSearxngParams(options, parsed);
      i++;
      continue;
    }
    if (arg === '--sx-theme' || arg.startsWith('--sx-theme=')) {
      parseValue(arg, '--sx-theme', (v) => {
        const value = v.trim();
        if (!value) {
          console.error(colorize('Error: --sx-theme requires a non-empty value', 'red'));
          process.exit(1);
        }
        assignSearxngParams(options, { theme: value });
      });
      i++;
      continue;
    }
    if (arg === '--sx-enabled-plugins' || arg.startsWith('--sx-enabled-plugins=')) {
      parseValue(arg, '--sx-enabled-plugins', (v) => {
        const value = normalizeSxCsvParam(v);
        if (!value) {
          console.error(
            colorize('Error: --sx-enabled-plugins requires a comma-separated value', 'red')
          );
          process.exit(1);
        }
        assignSearxngParams(options, { enabled_plugins: value });
      });
      i++;
      continue;
    }
    if (arg === '--sx-disabled-plugins' || arg.startsWith('--sx-disabled-plugins=')) {
      parseValue(arg, '--sx-disabled-plugins', (v) => {
        const value = normalizeSxCsvParam(v);
        if (!value) {
          console.error(
            colorize('Error: --sx-disabled-plugins requires a comma-separated value', 'red')
          );
          process.exit(1);
        }
        assignSearxngParams(options, { disabled_plugins: value });
      });
      i++;
      continue;
    }
    if (arg === '--sx-enabled-engines' || arg.startsWith('--sx-enabled-engines=')) {
      parseValue(arg, '--sx-enabled-engines', (v) => {
        const value = normalizeSxCsvParam(v);
        if (!value) {
          console.error(
            colorize('Error: --sx-enabled-engines requires a comma-separated value', 'red')
          );
          process.exit(1);
        }
        assignSearxngParams(options, { enabled_engines: value });
      });
      i++;
      continue;
    }
    if (arg === '--sx-disabled-engines' || arg.startsWith('--sx-disabled-engines=')) {
      parseValue(arg, '--sx-disabled-engines', (v) => {
        const value = normalizeSxCsvParam(v);
        if (!value) {
          console.error(
            colorize('Error: --sx-disabled-engines requires a comma-separated value', 'red')
          );
          process.exit(1);
        }
        assignSearxngParams(options, { disabled_engines: value });
      });
      i++;
      continue;
    }
    if (arg === '--sx-enabled-categories' || arg.startsWith('--sx-enabled-categories=')) {
      parseValue(arg, '--sx-enabled-categories', (v) => {
        const value = normalizeSxCsvParam(v);
        if (!value) {
          console.error(
            colorize('Error: --sx-enabled-categories requires a comma-separated value', 'red')
          );
          process.exit(1);
        }
        assignSearxngParams(options, { enabled_categories: value });
      });
      i++;
      continue;
    }
    if (arg === '--sx-disabled-categories' || arg.startsWith('--sx-disabled-categories=')) {
      parseValue(arg, '--sx-disabled-categories', (v) => {
        const value = normalizeSxCsvParam(v);
        if (!value) {
          console.error(
            colorize('Error: --sx-disabled-categories requires a comma-separated value', 'red')
          );
          process.exit(1);
        }
        assignSearxngParams(options, { disabled_categories: value });
      });
      i++;
      continue;
    }
    if (arg === '--sx-image-proxy' || arg.startsWith('--sx-image-proxy=')) {
      parseValue(arg, '--sx-image-proxy', (v) => {
        const parsed = parseSxBoolean(v);
        if (parsed === null) {
          console.error(
            colorize('Error: --sx-image-proxy expects true/false/1/0/yes/no/on/off', 'red')
          );
          process.exit(1);
        }
        assignSearxngParams(options, { image_proxy: parsed });
      });
      i++;
      continue;
    }
    if (arg === '--params-json' || arg.startsWith('--params-json=')) {
      let raw = '';
      if (arg.startsWith('--params-json=')) {
        raw = arg.split('=').slice(1).join('=');
      } else if (i + 1 < args.length) {
        raw = args[++i] ?? '';
      }
      if (!raw.trim()) {
        console.error(colorize('Error: --params-json requires a JSON object value', 'red'));
        process.exit(1);
      }
      const parsedParams = parseSearxngParamsObject(raw, '--params-json');
      assignSearxngParams(options, parsedParams);
      i++;
      continue;
    }
    if (arg === '--params-file' || arg.startsWith('--params-file=')) {
      let filePath = '';
      if (arg.startsWith('--params-file=')) {
        filePath = arg.split('=').slice(1).join('=');
      } else if (i + 1 < args.length) {
        filePath = args[++i] ?? '';
      }
      if (!filePath.trim()) {
        console.error(colorize('Error: --params-file requires a file path', 'red'));
        process.exit(1);
      }
      let fileContent = '';
      try {
        fileContent = fs.readFileSync(filePath, 'utf8');
      } catch (error) {
        console.error(
          colorize(
            `Error: Cannot read params file "${filePath}": ${(error as Error).message}`,
            'red'
          )
        );
        process.exit(1);
      }
      const parsedParams = parseSearxngParamsObject(fileContent, `--params-file (${filePath})`);
      assignSearxngParams(options, parsedParams);
      i++;
      continue;
    }
    if (arg.startsWith('--format') || arg === '-f') {
      parseValue(arg, '--format', (v) => {
        const normalized = v.toLowerCase() === 'ndjson' ? 'jsonl' : v;
        if (VALID_FORMATS.includes(normalized)) {
          options.format = normalized as OutputFormat;
        } else {
          console.error(colorize(`Error: Invalid format "${v}"`, 'red'));
          process.exit(1);
        }
      });
      i++;
      continue;
    }
    if (arg.startsWith('--engines') || arg === '-e') {
      parseValue(arg, '--engines', (v) => (options.engines = v));
      i++;
      continue;
    }
    if (arg.startsWith('--lang') || arg === '-l') {
      parseValue(arg, '--lang', (v) => (options.lang = v));
      i++;
      continue;
    }
    if (arg.startsWith('--page') || arg === '-p') {
      parseValue(arg, '--page', (v) => {
        const p = parseInt(v, 10);
        options.page = p > 0 ? p : 1;
      });
      i++;
      continue;
    }
    if (arg.startsWith('--safe')) {
      parseValue(arg, '--safe', (v) => {
        const s = parseInt(v, 10);
        options.safeSearch = VALID_SAFE_LEVELS.includes(s) ? (s as SafeSearchLevel) : 0;
      });
      i++;
      continue;
    }
    if (arg.startsWith('--timeout')) {
      parseValue(arg, '--timeout', (v) => (options.timeout = parseInt(v, 10) || DEFAULT_TIMEOUT));
      i++;
      continue;
    }
    if (arg.startsWith('--time') || arg === '-t') {
      parseValue(arg, '--time', (v) => {
        if (v && !VALID_TIME_RANGES.includes(v)) {
          console.error(colorize(`Error: Invalid time range "${v}"`, 'red'));
          process.exit(1);
        }
        options.timeRange = v as TimeRange;
      });
      i++;
      continue;
    }
    if (arg.startsWith('--category') || arg === '-c') {
      parseValue(arg, '--category', (v) => {
        if (v && !VALID_CATEGORIES.includes(v)) {
          console.error(colorize(`Error: Invalid category "${v}"`, 'red'));
          process.exit(1);
        }
        options.category = v;
      });
      i++;
      continue;
    }
    if (arg.startsWith('--limit') || arg === '-n') {
      parseValue(arg, '--limit', (v) => {
        const l = parseInt(v, 10);
        options.limit = isNaN(l) || l < 0 ? (config.defaultLimit ?? 10) : l;
      });
      i++;
      continue;
    }
    if (arg.startsWith('--retries') || arg === '-r') {
      parseValue(arg, '--retries', (v) => {
        const r = parseInt(v, 10);
        options.retries = r >= 0 ? r : MAX_RETRIES;
      });
      i++;
      continue;
    }
    if (arg.startsWith('--output') || arg === '-o') {
      parseValue(arg, '--output', (v) => (options.output = v));
      i++;
      continue;
    }
    if (arg === '--open' || arg === '-O') {
      parseValue(arg, '--open', (v) => (options.open = v ? parseInt(v, 10) : 1));
      i++;
      continue;
    }
    if (arg.startsWith('--filter')) {
      parseValue(arg, '--filter', (v) => (options.filter = v));
      i++;
      continue;
    }
    if (arg.startsWith('--domain')) {
      parseValue(arg, '--domain', (v) => (options.domainFilter = v));
      i++;
      continue;
    }
    if (arg.startsWith('--exclude-domain')) {
      parseValue(arg, '--exclude-domain', (v) => (options.excludeDomain = v));
      i++;
      continue;
    }
    if (arg.startsWith('--min-score')) {
      parseValue(arg, '--min-score', (v) => (options.minScore = v));
      i++;
      continue;
    }
    if (arg.startsWith('--date-after')) {
      parseValue(arg, '--date-after', (v) => (options.dateAfter = v));
      i++;
      continue;
    }
    if (arg.startsWith('--date-before')) {
      parseValue(arg, '--date-before', (v) => (options.dateBefore = v));
      i++;
      continue;
    }
    if (arg.startsWith('--batch')) {
      parseValue(arg, '--batch', (v) => (options.batch = v));
      i++;
      continue;
    }
    if (arg.startsWith('--multi')) {
      parseValue(arg, '--multi', (v) => (options.multiSearch = v));
      i++;
      continue;
    }
    if (arg.startsWith('--bookmark') || arg === '-b') {
      parseValue(arg, '--bookmark', (v) => (options.bookmark = v));
      i++;
      continue;
    }
    if (arg.startsWith('--export')) {
      parseValue(arg, '--export', (v) => (options.export = v));
      i++;
      continue;
    }
    if (arg.startsWith('--theme')) {
      parseValue(arg, '--theme', (v) => {
        options.theme = v as ColorTheme;
        if (COLOR_THEMES[v as ColorTheme]) setTheme(v as ColorTheme);
      });
      i++;
      continue;
    }
    if (arg.startsWith('--cluster')) {
      parseValue(arg, '--cluster', (v) => (options.cluster = v));
      i++;
      continue;
    }
    if (arg.startsWith('--compare')) {
      parseValue(arg, '--compare', (v) => (options.compare = v));
      i++;
      continue;
    }
    if (arg.startsWith('--preset')) {
      parseValue(arg, '--preset', (v) => (options.preset = v));
      i++;
      continue;
    }
    if (arg.startsWith('--save-preset')) {
      parseValue(arg, '--save-preset', (v) => (options.savePreset = v));
      i++;
      continue;
    }
    if (arg.startsWith('--group') || arg === '-g') {
      parseValue(arg, '--group', (v) => {
        options.group = v;
        if (v && ENGINE_GROUPS[v] !== undefined) options.engines = ENGINE_GROUPS[v];
      });
      i++;
      continue;
    }
    if (arg.startsWith('--extract')) {
      parseValue(arg, '--extract', (v) => (options.extract = v));
      i++;
      continue;
    }

    queryParts.push(arg);
    i++;
  }

  options.query = queryParts.join(' ').trim();
  return options;
}

export function showHelp(): void {
  console.log(`SearXNG CLI v${VERSION} - TypeScript search client`);
  console.log();
  console.log(`Usage: searxng [command] [flags]`);
  console.log(`       searxng [options] <query>`);
  console.log();
  console.log(`Commands:`);
  console.log(`  search, s            Run a search (default if command omitted)`);
  console.log(`  setup                Run interactive setup wizard (--local for bootstrap)`);
  console.log(`  settings             Show settings (settings json for machine output)`);
  console.log(`  set                  Update settings (set <key> <value>)`);
  console.log(`  cache                Cache operations (status/list/search/inspect/delete/...)`);
  console.log(`  formats              Formatter tools (verify/schema/validate)`);
  console.log(
    `  instance             Show instance capabilities (instance json for machine output)`
  );
  console.log(`  doctor               Release-readiness diagnostics (--json supported)`);
  console.log(`  health               Connection health check`);
  console.log(`  history              Show search history`);
  console.log(`  bookmarks            Show bookmarks`);
  console.log(`  suggestions          Show local query suggestions`);
  console.log(`  presets              List saved presets`);
  console.log(`  config               Manage config file (show/edit/reset)`);
  console.log(`  paths                Show ~/.searxng-cli file locations (JSON)`);
  console.log(`  version              Show version`);
  console.log(`  test                 Run built-in test suite`);
  console.log();
  console.log(`Global Flags (all commands):`);
  console.log(`  -h, --help           Show command-specific help`);
  console.log(`  -v, --version        Show version`);
  console.log(`  -V, --verbose        Verbose output`);
  console.log(`  -s, --silent         Minimal output`);
  console.log(`  --format <fmt>       Override output format`);
  console.log(`  --output <file>      Save output to file`);
  console.log(`  --settings-json      Machine-readable effective settings`);
  console.log(`  --paths-json         Machine-readable ~/.searxng-cli paths`);
  console.log(`  --no-cache           Disable cache for current command`);
  console.log();
  console.log(`Search:`);
  console.log(`  -f, --format <fmt>   Output format: toon, json, csv, md, yaml, table, xml`);
  console.log(`                      Also: jsonl/ndjson, text, simple, html-report, raw`);
  console.log(`  -e, --engines <list> Comma-separated engines (google,bing,duckduckgo)`);
  console.log(`  --param <k=v>        Pass through raw SearXNG query params (repeatable)`);
  console.log(`  --sx <k=v>           Alias for --param (explicit SearXNG passthrough)`);
  console.log(`  --sx-query <k=v&...> Pass URL-style SearXNG params in one argument`);
  console.log(`  --sx-theme <name>    Set upstream SearXNG theme query param`);
  console.log(`  --sx-enabled-plugins <list>  Enable SearXNG plugins (comma-separated)`);
  console.log(`  --sx-disabled-plugins <list> Disable SearXNG plugins (comma-separated)`);
  console.log(`  --sx-enabled-engines <list>  Force enabled_engines upstream`);
  console.log(`  --sx-disabled-engines <list> Force disabled_engines upstream`);
  console.log(`  --sx-enabled-categories <list>  Force enabled_categories upstream`);
  console.log(`  --sx-disabled-categories <list> Force disabled_categories upstream`);
  console.log(`  --sx-image-proxy <bool>      Set SearXNG image_proxy (true/false)`);
  console.log(`  --params-json <obj>  Pass SearXNG params as JSON object`);
  console.log(`  --params-file <path> Load SearXNG params from JSON file`);
  console.log(
    `  --multi <q1;q2>      Run multiple queries sequentially (separator: ;, ||, or newline)`
  );
  console.log(`  --autocomplete       Return SearXNG autocomplete suggestions for query`);
  console.log(`  --validate-output    Validate formatter output for CI/programmatic use`);
  console.log(`  --strict             Exit with code 2 if search returns no results`);
  console.log(`  --offline-first      Cache-only mode (no network, semantic+exact cache)`);
  console.log(`  --request-json       Show resolved SearXNG request URL/params as JSON`);
  console.log(`  -g, --group <name>   Engine group: dev, ai, security, docs, social`);
  console.log(`  -l, --lang <code>    Language code (en, de, fr)`);
  console.log(`  -p, --page <n>       Page number (default: 1)`);
  console.log(`  -t, --time <range>   Time range: day, week, month, year`);
  console.log(`  -c, --category <cat> Category: general, images, videos, news`);
  console.log(`  -n, --limit <n>      Max results (default: 10)`);
  console.log();
  console.log(`Output Formats (shorthand):`);
  console.log(`  --toon               TOON format (default)`);
  console.log(`  --json               JSON format`);
  console.log(`  --csv                CSV format`);
  console.log(`  --yaml / --yml       YAML format`);
  console.log(`  --markdown / --md    Markdown format`);
  console.log(`  --xml                XML format`);
  console.log(`  --table              ASCII table`);
  console.log(`  --text / --simple    Plain text`);
  console.log(`  --html / --html-report HTML report`);
  console.log();
  console.log(`Output:`);
  console.log(`  -o, --output <file>  Save to file`);
  console.log(`  --urls               Output only URLs`);
  console.log(`  --titles             Output only titles`);
  console.log(`  -V, --verbose        Show request details`);
  console.log();
  console.log(`Agent Mode:`);
  console.log(`  --mcp                Start Model Context Protocol (MCP) stdio server`);
  console.log(`  --agent              AI-optimized TOON output`);
  console.log(`  --agent-json         AI-optimized JSON output (validated + compact)`);
  console.log(`  --agent-ci           Agent mode + strict + offline-first + output validation`);
  console.log(`  --analyze            Include result analysis`);
  console.log(`  --citation           Output results as citations [1]`);
  console.log(`  --raw-content        Include full result content`);
  console.log(`  --fetch-content      Fetch and extract target webpage content`);
  console.log(`  --system-prompt <p>  Wrap output in a system prompt block`);
  console.log(`  --export-embeddings  Export vector embeddings for RAG`);
  console.log(`  --auto-refine        Automatically rewrite and retry poor queries`);
  console.log();
  console.log(`Setup:`);
  console.log(`  --setup              Interactive setup wizard`);
  console.log(`  --setup-local        Non-interactive local agent bootstrap`);
  console.log(`  --settings           Show current settings`);
  console.log(`  --settings-json      Show current settings as machine-readable JSON`);
  console.log(`  --paths-json         Show all ~/.searxng-cli file paths as JSON`);
  console.log(`  --health             Check server health`);
  console.log(`  --doctor             Full local release-readiness diagnostics`);
  console.log(`  --doctor-json        Machine-readable diagnostics JSON`);
  console.log(`  --verify-formats [q] Validate all formatter outputs against schemas`);
  console.log(`  --verify-formats-json [q] Same as above, but machine-readable JSON`);
  console.log(`  --schema [format]    Show output schema metadata (all/json/toon/csv/...)`);
  console.log(`  --schema-json [fmt]  Output schema metadata as JSON`);
  console.log(
    `  --validate-payload <fmt> [file|--input <file>] Validate saved/piped output payload`
  );
  console.log(
    `  --validate-payload-json <fmt> [file|--input <file>] Same as above, machine-readable JSON`
  );
  console.log(`  --instance-info      Show SearXNG instance capabilities`);
  console.log(`  --instance-info-json Show SearXNG capabilities in JSON`);
  console.log(`  --suggestions        Show locally stored recent/popular query suggestions`);
  console.log(`  --presets            List saved presets from ~/.searxng-cli/presets.json`);
  console.log(`  --preset <name>      Apply a saved preset before search`);
  console.log(`  --save-preset <name> Save current options as a reusable preset`);
  console.log(`  --engines-refresh    Refresh cached engines/categories from instance`);
  console.log();
  console.log(`Settings:`);
  console.log(`  --set-url <url>      Set SearXNG URL`);
  console.log(`  --set-local-url      Reset SearXNG URL to local default (${SEARXNG_URL})`);
  console.log(`  --set-limit <n>      Set default limit`);
  console.log(`  --set-format <fmt>   Set default format`);
  console.log(`  --set-theme <name>   Set theme (default/ocean/forest/sunset/mono)`);
  console.log(`  --set-force-local-routing <on|off> Force all searches to configured URL`);
  console.log(`  --set-force-local-agent-routing <on|off> Force --agent routing to local URL`);
  console.log(`  --set-param <k=v>    Set default SearXNG passthrough param`);
  console.log(`  --set-params-json <obj> Replace default SearXNG params from JSON object`);
  console.log(`  --set-params-query <q>  Replace default SearXNG params from URL query`);
  console.log(`  --unset-param <key>  Remove default SearXNG passthrough param`);
  console.log(`  --clear-params       Clear all default passthrough params`);
  console.log();
  console.log(`Cache:`);
  console.log(`  --cache              Show cache status`);
  console.log(`  --cache-status-json  Show cache status as machine-readable JSON`);
  console.log(`  --cache-clear        Clear cache`);
  console.log(`  --cache-list         List cached entries`);
  console.log();
  console.log(`Other:`);
  console.log(`  -q, --quick           Quick search (5 results)`);
  console.log(`  -i, --interactive     Interactive mode`);
  console.log(`  -h, --help           Show this help`);
  console.log(`  -v, --version        Show version`);
  console.log();
  console.log(`Config: ~/.searxng-cli/settings.json`);
}

export function showVersion(): void {
  const currentUrl = getSearxngUrl();
  const health = getConnectionHealth();
  const cacheLimit = LRU_CACHE_SIZE <= 0 ? 'unlimited' : String(LRU_CACHE_SIZE);
  console.log(`SearXNG CLI v${VERSION}`);
  console.log(`Server: ${currentUrl}`);
  console.log(`Type: ${isLocalInstance() ? 'local' : 'remote'}`);
  console.log(`Cache: ${resultCache.size}/${cacheLimit}`);
  console.log(`Health: ${health.healthy ? 'ok' : 'fail'} (${health.latency}ms)`);
}

export function openInBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;
  if (platform === 'darwin') cmd = 'open';
  else if (platform === 'win32') cmd = 'start';
  else cmd = 'xdg-open';
  spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
}

export function showSpinner(text: string, startTime: number): NodeJS.Timeout {
  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let idx = 0;
  return setInterval(() => {
    const elapsed = Date.now() - startTime;
    process.stderr.write(
      `\r${colorize(spinner[idx] ?? '', 'cyan')} ${text} ${formatDuration(elapsed)}`
    );
    idx = (idx + 1) % spinner.length;
  }, 80);
}
