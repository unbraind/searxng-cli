import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type {
  ColorConfig,
  ThemeColors,
  ColorTheme,
  InstanceInfo,
  AppConfig,
  SearchAlias,
} from '../types';

export const CONFIG_DIR =
  process.env.SEARXNG_CLI_CONFIG_DIR || path.join(os.homedir(), '.searxng-cli');
export const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const HISTORY_FILE = path.join(CONFIG_DIR, 'history.json');
export const BOOKMARKS_FILE = path.join(CONFIG_DIR, 'bookmarks.json');
export const PRESETS_FILE = path.join(CONFIG_DIR, 'presets.json');
export const SUGGESTIONS_FILE = path.join(CONFIG_DIR, 'suggestions.json');
export const SETUP_COMPLETE_FILE = path.join(CONFIG_DIR, '.setup-complete');
export const CACHE_FILE = path.join(CONFIG_DIR, 'cache.json');
export const ENGINES_CACHE_FILE = path.join(CONFIG_DIR, 'engines.json');

export const DEFAULT_SEARXNG_URL = 'http://localhost:8080';

export function normalizeSearxngUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol =
    trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname) return null;
    return withProtocol.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function loadSearxngUrlFromSettings(): string | null {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      if (settings.searxngUrl && typeof settings.searxngUrl === 'string') {
        return normalizeSearxngUrl(settings.searxngUrl);
      }
    }
  } catch {
    // Ignore settings read errors
  }
  return null;
}

function getInitialSearxngUrl(): string {
  const envUrl = normalizeSearxngUrl(process.env.SEARXNG_URL);
  if (envUrl) {
    return envUrl;
  }
  const settingsUrl = loadSearxngUrlFromSettings();
  if (settingsUrl) {
    return settingsUrl;
  }
  return DEFAULT_SEARXNG_URL;
}

let _searxngUrl: string = getInitialSearxngUrl();
let _isLocalInstance: boolean = computeIsLocal(_searxngUrl);

function computeIsLocal(url: string): boolean {
  return (
    url.startsWith('http://192.168.') ||
    url.startsWith('http://localhost') ||
    url.startsWith('http://127.')
  );
}

export const SEARXNG_URL: string = _searxngUrl;

export function getSearxngUrl(): string {
  return _searxngUrl;
}

export function setSearxngUrl(url: string): void {
  _searxngUrl = normalizeSearxngUrl(url) ?? DEFAULT_SEARXNG_URL;
  _isLocalInstance = computeIsLocal(_searxngUrl);
}

export function reloadSearxngUrl(): void {
  _searxngUrl = getInitialSearxngUrl();
  _isLocalInstance = computeIsLocal(_searxngUrl);
}

export function isLocalInstance(): boolean {
  return _isLocalInstance;
}

export const TOON_SPEC_VERSION = '3.0';
export const IS_LOCAL_INSTANCE: boolean = _isLocalInstance;
export const DEFAULT_TIMEOUT: number =
  parseInt(process.env.SEARXNG_TIMEOUT ?? '0', 10) || (IS_LOCAL_INSTANCE ? 15000 : 30000);
export const MAX_RETRIES: number =
  parseInt(process.env.SEARXNG_MAX_RETRIES ?? '0', 10) || (IS_LOCAL_INSTANCE ? 2 : 3);
export const RETRY_DELAY: number =
  parseInt(process.env.SEARXNG_RETRY_DELAY ?? '0', 10) || (IS_LOCAL_INSTANCE ? 100 : 1000);
declare const __APP_VERSION__: string | undefined;

function resolveVersion(): string {
  const injected = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  if (injected) return injected;
  if (process.env.npm_package_version) return process.env.npm_package_version;

  const candidates = [
    path.resolve(process.cwd(), 'package.json'),
    path.resolve(__dirname, '../../package.json'),
    path.resolve(__dirname, '../package.json'),
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { version?: unknown };
      if (typeof parsed.version === 'string' && parsed.version.trim()) {
        return parsed.version.trim();
      }
    } catch {
      continue;
    }
  }

  return '0.0.0-dev';
}

export const VERSION = resolveVersion();
export const RATE_LIMIT_DELAY: number = IS_LOCAL_INSTANCE ? 0 : 30;
export const MAX_CONCURRENT_REQUESTS: number = IS_LOCAL_INSTANCE ? 100 : 20;
export const PARALLEL_BATCH_SIZE: number = IS_LOCAL_INSTANCE ? 50 : 12;
export const LRU_CACHE_SIZE: number = 0;
export const HEALTH_CHECK_INTERVAL: number = IS_LOCAL_INSTANCE ? 120000 : 30000;
export const CONNECTION_TIMEOUT: number = IS_LOCAL_INSTANCE ? 500 : 3000;
export const CIRCUIT_BREAKER_THRESHOLD: number = IS_LOCAL_INSTANCE ? 25 : 5;
export const CIRCUIT_BREAKER_RESET_TIME: number = IS_LOCAL_INSTANCE ? 1000 : 30000;
export const REQUEST_DEDUP_WINDOW = 25;
export const DEFAULT_QUIET_LIMIT = 5;
export const JSON_INDENT: number = process.stdout.isTTY ? 2 : 0;
export const ENABLE_COMPRESSION = true;
export const PERSISTENT_CACHE_ENABLED = true;
export const CACHE_COMPRESSION = true;
export const LOCAL_CACHE_MAX_AGE = Infinity;
export const ENABLE_WARMUP = true;
export const PREFETCH_ENGINES = true;
export const AGENT_MODE_ENABLED = true;
export const RESULT_ANALYSIS_ENABLED = true;
export const ADAPTIVE_TIMEOUT_ENABLED = true;
export const STREAMING_ENABLED = true;
export const SMART_DEDUP_ENABLED = true;
export const RESULT_SCORING_ENABLED = true;
export const MAX_KEEPALIVE_SOCKETS: number = IS_LOCAL_INSTANCE ? 100 : 20;
export const SOCKET_TIMEOUT: number = IS_LOCAL_INSTANCE ? 3000 : 10000;
export const WARMUP_TIMEOUT: number = IS_LOCAL_INSTANCE ? 1000 : 3000;
export const PREFETCH_DELAY: number = IS_LOCAL_INSTANCE ? 0 : 100;

export const CACHE_MAX_AGE = Infinity;
export const ENGINES_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

export const IS_PIPE_MODE: boolean = !process.stdout.isTTY;
export const IS_TTY: boolean = process.stdout.isTTY;

export const COLORS: ColorConfig = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

export const COLOR_THEMES: Record<ColorTheme, ThemeColors> = {
  default: { primary: 'cyan', secondary: 'yellow', success: 'green', error: 'red', dim: 'dim' },
  ocean: {
    primary: 'blue',
    secondary: 'cyan',
    success: 'brightCyan',
    error: 'brightRed',
    dim: 'dim',
  },
  forest: {
    primary: 'green',
    secondary: 'brightGreen',
    success: 'green',
    error: 'red',
    dim: 'dim',
  },
  sunset: {
    primary: 'magenta',
    secondary: 'yellow',
    success: 'brightYellow',
    error: 'brightRed',
    dim: 'dim',
  },
  mono: {
    primary: 'white',
    secondary: 'brightWhite',
    success: 'white',
    error: 'brightWhite',
    dim: 'dim',
  },
};

let currentTheme: ColorTheme = 'default';

export const VALID_CATEGORIES: string[] = [
  'general',
  'images',
  'videos',
  'news',
  'music',
  'files',
  'it',
  'science',
  'social',
];
export const VALID_TIME_RANGES: string[] = ['day', 'week', 'month', 'year'];
export const VALID_FORMATS: string[] = [
  'toon',
  'json',
  'jsonl',
  'ndjson',
  'html',
  'csv',
  'markdown',
  'md',
  'raw',
  'yaml',
  'yml',
  'table',
  'html-report',
  'xml',
  'text',
  'simple',
];
export const VALID_SAFE_LEVELS: number[] = [0, 1, 2];
let validEngines: string[] = [
  'google',
  'bing',
  'duckduckgo',
  'yahoo',
  'startpage',
  'wikipedia',
  'youtube',
  'github',
  'reddit',
  'stackoverflow',
];
let instanceInfo: InstanceInfo = {
  name: 'SearXNG',
  version: 'unknown',
  engines_count: 0,
  categories_count: 0,
  api_version: '1.0',
};

export const RECOMMENDED_ENGINES: Record<string, string[]> = {
  general: ['google', 'bing', 'duckduckgo'],
  code: ['github', 'stackoverflow', 'gitlab'],
  news: ['google news', 'bing news', 'duckduckgo news'],
  images: ['google images', 'bing images', 'duckduckgo images'],
  videos: ['youtube', 'vimeo', 'dailymotion'],
  science: ['arxiv', 'pubmed', 'scholar'],
  privacy: ['duckduckgo', 'startpage', 'searx'],
};

export const ENGINE_GROUPS: Record<string, string | null> = {
  dev: 'github,stackoverflow,gitlab,reddit,devto',
  ai: 'google,arxiv,scholar,duckduckgo',
  security: 'github,cve,duckduckgo,google',
  docs: 'wikipedia,duckduckgo,google,stackoverflow',
  social: 'reddit,twitter,mastodon,lemmy',
  shop: 'google,amazon,ebay,aliexpress',
  all: null,
};

export const SEARCH_ALIASES: Record<string, SearchAlias> = {
  '!gh': { engines: 'github', desc: 'Search GitHub' },
  '!so': { engines: 'stackoverflow', desc: 'Search StackOverflow' },
  '!yt': { engines: 'youtube', desc: 'Search YouTube' },
  '!wiki': { engines: 'wikipedia', desc: 'Search Wikipedia' },
  '!reddit': { engines: 'reddit', desc: 'Search Reddit' },
  '!ddg': { engines: 'duckduckgo', desc: 'Search DuckDuckGo' },
  '!g': { engines: 'google', desc: 'Search Google' },
  '!bing': { engines: 'bing', desc: 'Search Bing' },
  '!yahoo': { engines: 'yahoo', desc: 'Search Yahoo' },
  '!startpage': { engines: 'startpage', desc: 'Search Startpage' },
  '!arxiv': { engines: 'arxiv', desc: 'Search arXiv' },
  '!pubmed': { engines: 'pubmed', desc: 'Search PubMed' },
  '!docker': { engines: 'dockerhub', desc: 'Search Docker Hub' },
  '!npm': { engines: 'npm', desc: 'Search npm' },
  '!pypi': { engines: 'pypi', desc: 'Search PyPI' },
  '!crates': { engines: 'crates', desc: 'Search crates.io' },
  '!go': { engines: 'golang', desc: 'Search Go packages' },
  '!img': { category: 'images', desc: 'Image search' },
  '!vid': { category: 'videos', desc: 'Video search' },
  '!news': { category: 'news', desc: 'News search' },
  '!music': { category: 'music', desc: 'Music search' },
  '!files': { category: 'files', desc: 'File search' },
  '!science': { category: 'science', desc: 'Science search' },
  '!code': { engines: 'github,stackoverflow', desc: 'Code search' },
  '!dev': { engines: 'github,stackoverflow,gitlab', desc: 'Dev search' },
  '!ai': { engines: 'arxiv,google', desc: 'AI research' },
  '!docs': { engines: 'wikipedia,duckduckgo', desc: 'General docs' },
  '!privacy': { engines: 'duckduckgo,startpage', desc: 'Privacy search' },
};

export function getThemeColor(type: keyof ThemeColors): string {
  const theme = COLOR_THEMES[currentTheme] ?? COLOR_THEMES.default;
  return theme[type] ?? type;
}

export function setTheme(theme: ColorTheme): void {
  if (COLOR_THEMES[theme]) {
    currentTheme = theme;
  }
}

export function getTheme(): ColorTheme {
  return currentTheme;
}

export function getValidEngines(): string[] {
  return [...validEngines];
}

export function setValidEngines(engines: string[]): void {
  validEngines = [...engines];
}

export function getValidCategories(): string[] {
  return [...VALID_CATEGORIES];
}

export function setValidCategories(categories: string[]): void {
  VALID_CATEGORIES.length = 0;
  VALID_CATEGORIES.push(...categories);
}

export function getInstanceInfo(): InstanceInfo {
  return { ...instanceInfo };
}

export function setInstanceInfo(info: Partial<InstanceInfo>): void {
  instanceInfo = { ...instanceInfo, ...info };
}

export function getDefaultConfig(): AppConfig {
  return {
    defaultLimit: 10,
    defaultFormat: 'toon',
    defaultTimeout: DEFAULT_TIMEOUT,
    autoUnescape: true,
    autoFormat: true,
    colorize: true,
    showScores: true,
    saveHistory: true,
    maxHistory: 100,
    defaultEngines: null,
    defaultCategory: null,
    theme: 'default',
  };
}

export {
  COLORS as colors,
  COLOR_THEMES as colorThemes,
  RECOMMENDED_ENGINES as recommendedEngines,
  ENGINE_GROUPS as engineGroups,
  SEARCH_ALIASES as searchAliases,
  currentTheme,
};
