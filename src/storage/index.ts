import * as fs from 'fs';
import * as readline from 'readline';
import { spawn } from 'child_process';
import {
  CONFIG_DIR,
  CONFIG_FILE,
  SETTINGS_FILE,
  HISTORY_FILE,
  BOOKMARKS_FILE,
  PRESETS_FILE,
  SUGGESTIONS_FILE,
  CACHE_FILE,
  ENGINES_CACHE_FILE,
  ENGINES_CACHE_MAX_AGE,
  SETUP_COMPLETE_FILE,
  DEFAULT_TIMEOUT,
  DEFAULT_SEARXNG_URL,
  getSearxngUrl,
  normalizeSearxngUrl,
  setSearxngUrl,
  VERSION,
  setValidEngines,
  setValidCategories,
  setInstanceInfo,
  getValidEngines,
  VALID_CATEGORIES,
  getInstanceInfo,
  COLOR_THEMES,
} from '../config';
import { colorize, truncate } from '../utils';
import { isGhAuthenticated, hasStarredRepo, starRepo, REPO_URL } from '../utils/github';
import { rateLimitedFetch } from '../http';
import type {
  AppConfig,
  HistoryEntry,
  BookmarkEntry,
  Suggestions,
  InstanceInfo,
  SearchResult,
  OutputFormat,
  Settings,
  GithubStarPromptStatus,
  GithubStarPromptSource,
} from '../types';

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function writeJsonFileIfMissing(filePath: string, data: unknown): void {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
}

export function bootstrapGlobalDataFiles(): void {
  ensureConfigDir();
  try {
    writeJsonFileIfMissing(HISTORY_FILE, []);
    writeJsonFileIfMissing(BOOKMARKS_FILE, []);
    writeJsonFileIfMissing(PRESETS_FILE, {});
    writeJsonFileIfMissing(SUGGESTIONS_FILE, { popular: [], recent: [] });
    writeJsonFileIfMissing(CACHE_FILE, {});
    writeJsonFileIfMissing(ENGINES_CACHE_FILE, {
      timestamp: 0,
      engines: [],
      categories: [],
      info: {
        name: 'SearXNG',
        version: 'unknown',
        engines_count: 0,
        categories_count: 0,
        api_version: '1.0',
        contact_url: null,
        donation_url: null,
        privacypolicy_url: null,
      },
    });
  } catch (e) {
    if (process.env.DEBUG) {
      console.error(
        colorize(
          `Warning: Could not bootstrap global data files: ${(e as Error).message}`,
          'yellow'
        )
      );
    }
  }
}

export function loadConfig(): AppConfig {
  ensureConfigDir();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data) as AppConfig;
    }
  } catch (e) {
    console.error(colorize(`Warning: Could not load config: ${(e as Error).message}`, 'yellow'));
  }
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

export function saveConfig(config: AppConfig): void {
  ensureConfigDir();
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error(colorize(`Warning: Could not save config: ${(e as Error).message}`, 'yellow'));
  }
}

export function loadHistory(): HistoryEntry[] {
  ensureConfigDir();
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      return JSON.parse(data) as HistoryEntry[];
    }
  } catch {
    // Ignore history load errors
  }
  return [];
}

export function saveHistory(history: HistoryEntry[]): void {
  ensureConfigDir();
  const config = loadConfig();
  try {
    const trimmedHistory =
      history.length > config.maxHistory ? history.slice(-config.maxHistory) : history;
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmedHistory, null, 2));
  } catch {
    // Ignore history save errors
  }
}

export function addToHistory(query: string): void {
  const config = loadConfig();
  if (!config.saveHistory) return;
  const history = loadHistory();
  history.push({ query, timestamp: new Date().toISOString() });
  saveHistory(history);
}

export function loadBookmarks(): BookmarkEntry[] {
  ensureConfigDir();
  try {
    if (fs.existsSync(BOOKMARKS_FILE)) {
      const data = fs.readFileSync(BOOKMARKS_FILE, 'utf8');
      return JSON.parse(data) as BookmarkEntry[];
    }
  } catch {
    // Ignore bookmark load errors
  }
  return [];
}

export function saveBookmarks(bookmarks: BookmarkEntry[]): void {
  ensureConfigDir();
  try {
    fs.writeFileSync(BOOKMARKS_FILE, JSON.stringify(bookmarks, null, 2));
  } catch {
    // Ignore bookmark save errors
  }
}

export function addBookmark(result: SearchResult): number {
  const bookmarks = loadBookmarks();
  bookmarks.push({ ...result, bookmarkedAt: new Date().toISOString() });
  saveBookmarks(bookmarks);
  return bookmarks.length;
}

interface Preset {
  createdAt: string;
  [key: string]: unknown;
}

export function loadPresets(): Record<string, Preset> {
  ensureConfigDir();
  try {
    if (fs.existsSync(PRESETS_FILE)) {
      const data = fs.readFileSync(PRESETS_FILE, 'utf8');
      return JSON.parse(data) as Record<string, Preset>;
    }
  } catch {
    // Ignore preset load errors
  }
  return {};
}

export function savePresets(presets: Record<string, Preset>): void {
  ensureConfigDir();
  try {
    fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2));
  } catch {
    // Ignore preset save errors
  }
}

export function addPreset(name: string, options: Record<string, unknown>): number {
  const presets = loadPresets();
  presets[name] = { ...options, createdAt: new Date().toISOString() };
  savePresets(presets);
  return Object.keys(presets).length;
}

export function loadSuggestions(): Suggestions {
  ensureConfigDir();
  try {
    if (fs.existsSync(SUGGESTIONS_FILE)) {
      const data = fs.readFileSync(SUGGESTIONS_FILE, 'utf8');
      return JSON.parse(data) as Suggestions;
    }
  } catch {
    // Ignore suggestions load errors
  }
  return { popular: [], recent: [] };
}

export function saveSuggestions(suggestions: Suggestions): void {
  ensureConfigDir();
  try {
    fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(suggestions, null, 2));
  } catch {
    // Ignore suggestions save errors
  }
}

export function updateSuggestions(query: string): void {
  const suggestions = loadSuggestions();
  suggestions.recent = suggestions.recent.filter((q) => q !== query).slice(0, 49);
  suggestions.recent.unshift(query);
  const counts: Record<string, number> = {};
  [...suggestions.recent, ...suggestions.popular].forEach((q) => {
    counts[q] = (counts[q] ?? 0) + 1;
  });
  suggestions.popular = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([q]) => q);
  saveSuggestions(suggestions);
}

interface EnginesCacheData {
  timestamp: number;
  engines: string[];
  categories: string[];
  info: InstanceInfo;
}

export interface InstanceCapabilities {
  instance: InstanceInfo;
  categories: string[];
  languages: string[];
  engines: Array<{ name: string; categories: string[]; language: string; paging: boolean }>;
  plugins: string[];
}

export async function discoverInstance(refresh = false): Promise<void> {
  ensureConfigDir();

  if (!refresh && fs.existsSync(ENGINES_CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(ENGINES_CACHE_FILE, 'utf8')) as EnginesCacheData;
      if (Date.now() - cached.timestamp < ENGINES_CACHE_MAX_AGE) {
        setValidEngines(cached.engines ?? getValidEngines());
        setValidCategories(cached.categories ?? VALID_CATEGORIES);
        setInstanceInfo(cached.info ?? getInstanceInfo());
        return;
      }
    } catch {
      // Ignore cache read errors
    }
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const searxngUrl = getSearxngUrl();
    const response = await rateLimitedFetch(`${searxngUrl}/config`, {
      signal: controller.signal,
      headers: { 'User-Agent': `searxng-cli/${VERSION}`, Accept: 'application/json' },
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      const config = (await response.json()) as {
        engines?: Array<{ name: string; disabled?: boolean }>;
        categories?: string[];
        instance_name?: string;
        version?: string;
        contact_url?: string;
        donation_url?: string;
        privacypolicy_url?: string;
        api_version?: string;
      };

      let engines = getValidEngines();
      let categories = [...VALID_CATEGORIES];

      if (config.engines && Array.isArray(config.engines)) {
        engines = config.engines
          .filter((e) => e && e.name && !e.disabled)
          .map((e) => e.name)
          .sort();
      }
      if (config.categories && Array.isArray(config.categories)) {
        categories = config.categories.filter((c) => c && !c.includes('_')).sort();
      }

      const info: InstanceInfo = {
        name: config.instance_name ?? 'SearXNG',
        version: config.version ?? 'unknown',
        engines_count: engines.length,
        categories_count: categories.length,
        contact_url: config.contact_url ?? null,
        donation_url: config.donation_url ?? null,
        privacypolicy_url: config.privacypolicy_url ?? null,
        api_version: config.api_version ?? '1.0',
      };

      setValidEngines(engines);
      setValidCategories(categories);
      setInstanceInfo(info);

      fs.writeFileSync(
        ENGINES_CACHE_FILE,
        JSON.stringify(
          {
            timestamp: Date.now(),
            engines,
            categories,
            info,
          },
          null,
          2
        )
      );
    }
  } catch (e) {
    if (process.env.DEBUG) {
      console.error(colorize(`Discovery warning: ${(e as Error).message}`, 'dim'));
    }
  }
}

export async function fetchInstanceCapabilities(): Promise<InstanceCapabilities> {
  const searxngUrl = getSearxngUrl();
  const response = await rateLimitedFetch(`${searxngUrl}/config`, {
    headers: { 'User-Agent': `searxng-cli/${VERSION}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const config = (await response.json()) as {
    engines?: Array<{
      name: string;
      categories?: string[];
      language?: string;
      paging?: boolean;
      disabled?: boolean;
    }>;
    categories?: string[];
    search?: { languages?: string[] };
    plugin?: Record<string, unknown>;
    instance_name?: string;
    version?: string;
    contact_url?: string;
    donation_url?: string;
    privacypolicy_url?: string;
    api_version?: string;
  };

  const engines = (config.engines ?? [])
    .filter((engine) => engine && engine.name && !engine.disabled)
    .map((engine) => ({
      name: engine.name,
      categories: Array.isArray(engine.categories) ? engine.categories : [],
      language: engine.language ?? 'all',
      paging: Boolean(engine.paging),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const categories = Array.isArray(config.categories)
    ? config.categories.filter((category) => typeof category === 'string')
    : [];
  const languages = Array.isArray(config.search?.languages)
    ? config.search.languages.filter((language) => typeof language === 'string')
    : [];
  const plugins = config.plugin
    ? Object.entries(config.plugin)
        .filter((entry) => Boolean(entry[1]))
        .map((entry) => entry[0])
        .sort()
    : [];

  return {
    instance: {
      name: config.instance_name ?? 'SearXNG',
      version: config.version ?? 'unknown',
      engines_count: engines.length,
      categories_count: categories.length,
      contact_url: config.contact_url ?? null,
      donation_url: config.donation_url ?? null,
      privacypolicy_url: config.privacypolicy_url ?? null,
      api_version: config.api_version ?? '1.0',
    },
    categories,
    languages,
    engines,
    plugins,
  };
}

export function showSearchHistory(limit = 20): void {
  const history = loadHistory();
  if (history.length === 0) {
    console.log(colorize('\nNo search history found.', 'dim'));
    return;
  }
  console.log(colorize('\nSearch History:', 'cyan,bold'));
  const recent = history.slice(-limit).reverse();
  recent.forEach((item, idx) => {
    const num = history.length - idx;
    console.log(`  ${String(num).padStart(3)}. ${truncate(item.query, 50)}`);
  });
  console.log(colorize(`\nTotal: ${history.length}`, 'dim'));
}

export function showBookmarks(): void {
  const bookmarks = loadBookmarks();
  if (bookmarks.length === 0) {
    console.log(colorize('\nNo bookmarks saved.', 'dim'));
    return;
  }
  console.log(colorize('\nBookmarks:', 'cyan,bold'));
  bookmarks.forEach((item, idx) => {
    console.log(`  ${String(idx + 1).padStart(3)}. ${truncate(item.title ?? item.url, 60)}`);
  });
  console.log(colorize(`\nTotal: ${bookmarks.length}`, 'dim'));
}

export function manageConfig(action: string): void {
  const config = loadConfig();
  if (action === 'show' || !action) {
    console.log(colorize('\nConfiguration:', 'cyan,bold'));
    console.log(`  defaultLimit: ${config.defaultLimit}`);
    console.log(`  defaultFormat: ${config.defaultFormat}`);
    console.log(`  defaultTimeout: ${config.defaultTimeout}ms`);
    console.log(`  saveHistory: ${config.saveHistory}`);
    console.log(`  Config file: ${CONFIG_FILE}`);
    return;
  }
  if (action === 'edit') {
    const editor = process.env.EDITOR ?? 'nano';
    spawn(editor, [CONFIG_FILE], { stdio: 'inherit' });
    return;
  }
  if (action === 'reset') {
    saveConfig({
      defaultLimit: 10,
      defaultFormat: 'toon',
      defaultTimeout: DEFAULT_TIMEOUT,
      autoUnescape: true,
      autoFormat: true,
      saveHistory: true,
      maxHistory: 100,
      colorize: true,
      showScores: true,
      defaultEngines: null,
      defaultCategory: null,
      theme: 'default',
    });
    console.log(colorize('\n✓ Configuration reset', 'green'));
    return;
  }
  console.log(colorize(`Unknown action: ${action}. Valid: show, edit, reset`, 'red'));
}

const VALID_SETTINGS_FORMATS = [
  'toon',
  'json',
  'jsonl',
  'ndjson',
  'csv',
  'markdown',
  'md',
  'raw',
  'yaml',
  'yml',
  'table',
  'html',
  'html-report',
  'xml',
  'text',
  'simple',
];

function normalizeOutputFormat(value: unknown, fallback: OutputFormat = 'toon'): OutputFormat {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw) return fallback;
  if (raw === 'md') return 'markdown';
  if (raw === 'yml') return 'yaml';
  if (raw === 'html') return 'html-report';
  if (raw === 'ndjson') return 'jsonl';
  if (VALID_SETTINGS_FORMATS.includes(raw)) return raw as OutputFormat;
  return fallback;
}

function normalizeSearxngParams(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [key, paramValue] of Object.entries(value as Record<string, unknown>)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;
    if (
      paramValue === null ||
      typeof paramValue === 'string' ||
      typeof paramValue === 'number' ||
      typeof paramValue === 'boolean'
    ) {
      normalized[trimmedKey] = String(paramValue);
    }
  }
  return normalized;
}

const GITHUB_STAR_PROMPT_STATUSES: GithubStarPromptStatus[] = [
  'starred',
  'declined',
  'already-starred',
  'manual-link-shown',
  'star-failed',
];
const GITHUB_STAR_PROMPT_SOURCES: GithubStarPromptSource[] = ['first-run', 'setup', 'setup-local'];

function normalizeGithubStarPrompt(value: unknown): Settings['githubStarPrompt'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as {
    status?: unknown;
    source?: unknown;
    completedAt?: unknown;
  };
  if (
    !candidate.status ||
    !candidate.source ||
    !candidate.completedAt ||
    typeof candidate.status !== 'string' ||
    typeof candidate.source !== 'string' ||
    typeof candidate.completedAt !== 'string'
  ) {
    return null;
  }
  if (!GITHUB_STAR_PROMPT_STATUSES.includes(candidate.status as GithubStarPromptStatus)) {
    return null;
  }
  if (!GITHUB_STAR_PROMPT_SOURCES.includes(candidate.source as GithubStarPromptSource)) {
    return null;
  }

  return {
    status: candidate.status as GithubStarPromptStatus,
    source: candidate.source as GithubStarPromptSource,
    completedAt: candidate.completedAt,
  };
}

function parseSearxngParamsJson(raw: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.error(colorize('Error: params JSON must be an object', 'red'));
      return null;
    }
    return normalizeSearxngParams(parsed);
  } catch (error) {
    console.error(colorize(`Error: Invalid params JSON: ${(error as Error).message}`, 'red'));
    return null;
  }
}

function parseSearxngParamsQuery(raw: string): Record<string, string> | null {
  const query = raw.trim();
  if (!query) {
    console.error(colorize('Error: params query cannot be empty', 'red'));
    return null;
  }
  if (!query.includes('=')) {
    console.error(colorize('Error: params query must include key=value pairs', 'red'));
    return null;
  }
  const parsed = new URLSearchParams(query);
  const params: Record<string, string> = {};
  for (const [key, value] of parsed.entries()) {
    const normalizedKey = key.trim();
    if (normalizedKey) {
      params[normalizedKey] = value;
    }
  }
  if (Object.keys(params).length === 0) {
    console.error(colorize('Error: params query did not include any key=value pairs', 'red'));
    return null;
  }
  return params;
}

export function getDefaultSettings(): Settings {
  return {
    searxngUrl: DEFAULT_SEARXNG_URL,
    defaultSearxngParams: {},
    forceLocalRouting: true,
    forceLocalAgentRouting: true,
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
    lastSetupVersion: VERSION,
    setupCompletedAt: new Date().toISOString(),
    githubStarPrompt: null,
  };
}

export function applyLocalAgentDefaults(): Settings {
  const now = new Date().toISOString();
  const current = loadSettings();
  const updated: Settings = {
    ...current,
    searxngUrl: DEFAULT_SEARXNG_URL,
    defaultSearxngParams: {},
    forceLocalRouting: true,
    forceLocalAgentRouting: true,
    defaultFormat: 'toon',
    defaultLimit: 10,
    autoFormat: true,
    autoUnescape: true,
    lastSetupVersion: VERSION,
    setupCompletedAt: now,
  };
  saveSettings(updated);
  markSetupComplete();
  return updated;
}

export function loadSettings(): Settings {
  ensureConfigDir();
  bootstrapGlobalDataFiles();
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const settings = JSON.parse(data) as Settings;
      const merged = { ...getDefaultSettings(), ...settings };
      merged.searxngUrl = normalizeSearxngUrl(merged.searxngUrl) ?? DEFAULT_SEARXNG_URL;
      merged.defaultFormat = normalizeOutputFormat(merged.defaultFormat);
      merged.defaultSearxngParams = normalizeSearxngParams(merged.defaultSearxngParams);
      merged.forceLocalRouting = merged.forceLocalRouting !== false;
      merged.forceLocalAgentRouting = merged.forceLocalAgentRouting !== false;
      merged.githubStarPrompt = normalizeGithubStarPrompt(merged.githubStarPrompt);
      return merged;
    }
    if (fs.existsSync(CONFIG_FILE)) {
      const config = loadConfig();
      const migrated: Settings = {
        ...getDefaultSettings(),
        ...config,
      };
      migrated.defaultFormat = normalizeOutputFormat(migrated.defaultFormat);
      saveSettings(migrated);
      return migrated;
    }
    const defaults = getDefaultSettings();
    saveSettings(defaults);
    return defaults;
  } catch (e) {
    if (process.env.DEBUG) {
      console.error(
        colorize(`Warning: Could not load settings: ${(e as Error).message}`, 'yellow')
      );
    }
  }
  return getDefaultSettings();
}

export async function promptForStar(
  existingRl?: readline.Interface,
  source: GithubStarPromptSource = 'setup'
): Promise<void> {
  if (process.env.CI || process.env.NO_GH_STAR_PROMPT === '1') {
    return;
  }

  const settings = loadSettings();
  if (settings.githubStarPrompt?.status) {
    return;
  }

  const markPromptHandled = (status: GithubStarPromptStatus): void => {
    const updated: Settings = {
      ...settings,
      githubStarPrompt: {
        status,
        source,
        completedAt: new Date().toISOString(),
      },
    };
    saveSettings(updated);
  };

  const showManualLink = (): void => {
    console.log();
    console.log(colorize('⭐ Like this tool? Support us on GitHub!', 'yellow,bold'));
    console.log(colorize(REPO_URL, 'dim'));
  };

  if (!isGhAuthenticated()) {
    showManualLink();
    console.log(
      colorize(
        '  Install/authenticate gh CLI to star from terminal, or open the URL above to star manually.',
        'dim'
      )
    );
    markPromptHandled('manual-link-shown');
    return;
  }

  if (hasStarredRepo()) {
    markPromptHandled('already-starred');
    return;
  }

  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    return;
  }

  const rl =
    existingRl ||
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  try {
    showManualLink();
    const answer = await question(colorize('Would you like to star the repo? [Y/n]: ', 'cyan'));
    const normalized = answer.trim().toLowerCase();

    if (normalized === 'n') {
      markPromptHandled('declined');
      return;
    }

    if (starRepo()) {
      console.log(colorize('  ✓ Thank you for your support! ⭐', 'green'));
      markPromptHandled('starred');
      return;
    }

    console.log(
      colorize(
        '  ✗ Failed to star via gh CLI. You can star it manually at the URL above!',
        'yellow'
      )
    );
    markPromptHandled('star-failed');
  } finally {
    if (!existingRl) {
      rl.close();
    }
  }
}

export function saveSettings(settings: Settings): void {
  ensureConfigDir();
  try {
    const normalizedSettings = {
      ...settings,
      searxngUrl: normalizeSearxngUrl(settings.searxngUrl) ?? DEFAULT_SEARXNG_URL,
      defaultFormat: normalizeOutputFormat(settings.defaultFormat),
      defaultSearxngParams: normalizeSearxngParams(settings.defaultSearxngParams),
      githubStarPrompt: normalizeGithubStarPrompt(settings.githubStarPrompt),
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(normalizedSettings, null, 2));
    if (normalizedSettings.searxngUrl) {
      setSearxngUrl(normalizedSettings.searxngUrl);
    }
  } catch (e) {
    console.error(colorize(`Warning: Could not save settings: ${(e as Error).message}`, 'yellow'));
  }
}

export function isSetupComplete(): boolean {
  return fs.existsSync(SETUP_COMPLETE_FILE);
}

export function markSetupComplete(): void {
  ensureConfigDir();
  try {
    fs.writeFileSync(SETUP_COMPLETE_FILE, new Date().toISOString());
  } catch {
    // Ignore errors
  }
}

export async function testConnection(
  url: string
): Promise<{ success: boolean; latency: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(`${url}/config`, {
      headers: { 'User-Agent': `searxng-cli/${VERSION}` },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return {
      success: response.ok,
      latency: Date.now() - start,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (e) {
    return {
      success: false,
      latency: Date.now() - start,
      error: (e as Error).message,
    };
  }
}

export async function runSetupWizard(source: GithubStarPromptSource = 'setup'): Promise<Settings> {
  const existingSettings = fs.existsSync(SETTINGS_FILE) ? loadSettings() : null;

  console.log(colorize('\n╔════════════════════════════════════════════════════════════╗', 'cyan'));
  console.log(
    colorize('║         SearXNG CLI Setup Wizard                           ║', 'bold,brightGreen')
  );
  console.log(colorize('╚════════════════════════════════════════════════════════════╝', 'cyan'));
  console.log();
  console.log(colorize('This wizard will help you configure SearXNG CLI.', 'dim'));
  console.log(colorize('Press Enter to accept defaults, or type your values.', 'dim'));
  console.log();

  if (existingSettings) {
    console.log(colorize('Existing settings found:', 'yellow'));
    console.log(colorize(`  SearXNG URL: ${existingSettings.searxngUrl}`, 'dim'));
    console.log(colorize(`  Default format: ${existingSettings.defaultFormat}`, 'dim'));
    console.log(colorize(`  Default limit: ${existingSettings.defaultLimit}`, 'dim'));
    console.log(colorize(`  Theme: ${existingSettings.theme}`, 'dim'));
    console.log();
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  const settings: Settings = existingSettings ?? getDefaultSettings();

  try {
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log(colorize('Step 1/7: Configure SearXNG Instance', 'yellow,bold'));
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log();
    console.log(colorize('Your locally hosted SearXNG instance URL.', 'dim'));
    console.log(colorize(`Current: ${settings.searxngUrl}`, 'dim'));
    const urlInput = await question(colorize(`URL [Enter to keep]: `, 'cyan'));

    if (urlInput.trim()) {
      const newUrl = normalizeSearxngUrl(urlInput) ?? '';
      if (!newUrl) {
        console.log(colorize(`  ✗ Invalid URL format. Keeping: ${settings.searxngUrl}`, 'yellow'));
      } else {
        process.stdout.write(colorize('  Testing connection...', 'dim'));
        const testResult = await testConnection(newUrl);
        process.stdout.write('\r' + ' '.repeat(40) + '\r');

        if (testResult.success) {
          settings.searxngUrl = newUrl;
          console.log(colorize(`  ✓ Connected! Latency: ${testResult.latency}ms`, 'green'));
        } else {
          console.log(colorize(`  ✗ Failed: ${testResult.error}`, 'red'));
          const continueAnyway = await question(
            colorize('  Use this URL anyway? [y/N]: ', 'yellow')
          );
          if (continueAnyway.toLowerCase() === 'y') {
            settings.searxngUrl = newUrl;
          }
        }
      }
    } else {
      process.stdout.write(colorize('  Testing current connection...', 'dim'));
      const testResult = await testConnection(settings.searxngUrl);
      process.stdout.write('\r' + ' '.repeat(40) + '\r');
      if (testResult.success) {
        console.log(colorize(`  ✓ Connected! Latency: ${testResult.latency}ms`, 'green'));
      } else {
        console.log(colorize(`  ✗ Failed: ${testResult.error}`, 'red'));
      }
    }

    console.log();
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log(colorize('Step 2/7: Output Format', 'yellow,bold'));
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log();
    console.log(colorize('TOON format is optimized for LLMs (~40% fewer tokens).', 'dim'));
    console.log(
      colorize(
        'Other formats: json, jsonl/ndjson, csv, markdown, yaml, table, xml, html-report',
        'dim'
      )
    );
    console.log(colorize(`Current: ${settings.defaultFormat}`, 'dim'));
    const formatInput = await question(colorize(`Format [Enter for 'toon']: `, 'cyan'));

    if (formatInput.trim()) {
      if (VALID_SETTINGS_FORMATS.includes(formatInput.trim().toLowerCase())) {
        settings.defaultFormat = normalizeOutputFormat(formatInput);
        console.log(colorize(`  ✓ Format set to: ${settings.defaultFormat}`, 'green'));
      } else {
        console.log(colorize(`  ✗ Invalid format. Using: toon`, 'yellow'));
        settings.defaultFormat = 'toon';
      }
    }

    console.log();
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log(colorize('Step 3/7: Result Limit', 'yellow,bold'));
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log();
    console.log(colorize('Maximum number of results per search.', 'dim'));
    console.log(colorize(`Current: ${settings.defaultLimit}`, 'dim'));
    const limitInput = await question(colorize(`Limit [Enter for 10]: `, 'cyan'));

    if (limitInput.trim()) {
      const limit = parseInt(limitInput, 10);
      if (!isNaN(limit) && limit > 0) {
        settings.defaultLimit = limit;
        console.log(colorize(`  ✓ Limit set to: ${limit}`, 'green'));
      } else {
        console.log(colorize(`  ✗ Invalid number. Using: ${settings.defaultLimit}`, 'yellow'));
      }
    }

    console.log();
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log(colorize('Step 4/7: Search History', 'yellow,bold'));
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log();
    console.log(colorize(`Currently: ${settings.saveHistory ? 'Enabled' : 'Disabled'}`, 'dim'));
    const historyInput = await question(colorize(`Save history? [Y/n]: `, 'cyan'));

    if (historyInput.toLowerCase() === 'n') {
      settings.saveHistory = false;
      console.log(colorize(`  ✓ History disabled`, 'green'));
    } else {
      settings.saveHistory = true;
      console.log(colorize(`  ✓ History enabled`, 'green'));
      if (settings.maxHistory) {
        console.log(colorize(`  Max entries: ${settings.maxHistory}`, 'dim'));
        const maxHistoryInput = await question(colorize(`  Max entries [Enter for 100]: `, 'cyan'));
        if (maxHistoryInput.trim()) {
          const maxHistory = parseInt(maxHistoryInput, 10);
          if (!isNaN(maxHistory) && maxHistory > 0) {
            settings.maxHistory = maxHistory;
          }
        }
      }
    }

    console.log();
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log(colorize('Step 5/7: Display Settings', 'yellow,bold'));
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log();
    console.log(colorize(`Show scores: ${settings.showScores ? 'Yes' : 'No'}`, 'dim'));
    const scoresInput = await question(colorize(`Show result scores? [Y/n]: `, 'cyan'));

    if (scoresInput.toLowerCase() === 'n') {
      settings.showScores = false;
    } else {
      settings.showScores = true;
    }
    console.log(colorize(`  ✓ Scores: ${settings.showScores ? 'visible' : 'hidden'}`, 'green'));

    console.log();
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log(colorize('Step 6/7: Color Theme', 'yellow,bold'));
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log();
    console.log(colorize('Themes: default, ocean, forest, sunset, mono', 'dim'));
    console.log(colorize(`Current: ${settings.theme}`, 'dim'));
    const themeInput = await question(colorize(`Theme [Enter for 'default']: `, 'cyan'));

    if (themeInput.trim()) {
      const validThemes = ['default', 'ocean', 'forest', 'sunset', 'mono'];
      if (validThemes.includes(themeInput.trim().toLowerCase())) {
        settings.theme = themeInput.trim().toLowerCase() as Settings['theme'];
        console.log(colorize(`  ✓ Theme: ${settings.theme}`, 'green'));
      } else {
        console.log(colorize(`  ✗ Invalid theme. Using: ${settings.theme}`, 'yellow'));
      }
    }

    console.log();
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log(colorize('Step 7/8: Default SearXNG passthrough params', 'yellow,bold'));
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log();
    console.log(
      colorize(
        'Optional URL-style default params sent with every search (e.g. language=en-US).',
        'dim'
      )
    );
    console.log(
      colorize(
        'Useful for enabling plugins, themes, engine/category overrides, and language defaults.',
        'dim'
      )
    );
    const paramsCurrent = new URLSearchParams(settings.defaultSearxngParams).toString();
    console.log(colorize(`Current: ${paramsCurrent || '(none)'}`, 'dim'));
    const paramsInput = await question(colorize('Default params [Enter to keep]: ', 'cyan'));
    if (paramsInput.trim()) {
      const parsed = parseSearxngParamsQuery(paramsInput);
      if (parsed) {
        settings.defaultSearxngParams = parsed;
        console.log(colorize('  ✓ Default passthrough params updated', 'green'));
      } else {
        console.log(colorize('  ✗ Invalid params query. Keeping existing defaults.', 'yellow'));
      }
    }

    console.log();
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log(colorize('Step 8/8: AI Agent Optimization', 'yellow,bold'));
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log();
    console.log(colorize('Enable optimizations for AI agents/LLMs by default?', 'dim'));
    console.log(colorize('This enables TOON format and result analysis.', 'dim'));
    const agentInput = await question(colorize(`Enable Agent Mode? [y/N]: `, 'cyan'));

    if (agentInput.toLowerCase() === 'y') {
      settings.defaultFormat = 'toon';
      settings.autoFormat = true;
      settings.autoUnescape = true;
      console.log(colorize(`  ✓ Agent Mode optimizations enabled`, 'green'));
    }

    settings.lastSetupVersion = VERSION;
    settings.setupCompletedAt = new Date().toISOString();

    console.log();
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log(colorize('Summary', 'yellow,bold'));
    console.log(colorize('━'.repeat(60), 'cyan'));
    console.log();
    console.log(`  SearXNG URL:    ${colorize(settings.searxngUrl, 'cyan')}`);
    console.log(`  Default format: ${colorize(settings.defaultFormat, 'cyan')}`);
    console.log(`  Result limit:   ${colorize(String(settings.defaultLimit), 'cyan')}`);
    console.log(`  Save history:   ${colorize(settings.saveHistory ? 'Yes' : 'No', 'cyan')}`);
    console.log(`  Show scores:    ${colorize(settings.showScores ? 'Yes' : 'No', 'cyan')}`);
    console.log(`  Theme:          ${colorize(settings.theme, 'cyan')}`);
    const summaryParams = new URLSearchParams(settings.defaultSearxngParams).toString();
    console.log(`  Default params: ${colorize(summaryParams || '(none)', 'cyan')}`);
    console.log(
      `  Agent Mode:     ${colorize(settings.defaultFormat === 'toon' ? 'Optimized' : 'Standard', 'cyan')}`
    );
    console.log();

    const confirmInput = await question(colorize('Save these settings? [Y/n]: ', 'cyan'));

    if (confirmInput.toLowerCase() === 'n') {
      console.log();
      console.log(colorize('Setup cancelled. No changes made.', 'yellow'));
      rl.close();
      return settings;
    }

    saveSettings(settings);
    markSetupComplete();

    await promptForStar(rl, source);

    console.log();
    console.log(
      colorize('╔════════════════════════════════════════════════════════════╗', 'green')
    );
    console.log(
      colorize('║              ✓ Setup Complete!                             ║', 'bold,brightGreen')
    );
    console.log(
      colorize('╚════════════════════════════════════════════════════════════╝', 'green')
    );
    console.log();
    console.log(colorize(`Settings saved to: ${SETTINGS_FILE}`, 'dim'));
    console.log();
    console.log(colorize('Quick Start:', 'cyan,bold'));
    console.log('  searxng "your search query"      # Basic search');
    console.log('  searxng --agent "query"          # AI agent mode');
    console.log('  searxng --help                   # Show all options');
    console.log();
    console.log(colorize('Run --setup again anytime to reconfigure.', 'dim'));
  } finally {
    rl.close();
  }

  return settings;
}

export async function showSettings(): Promise<void> {
  const settings = loadSettings();

  console.log(colorize('\n╔════════════════════════════════════════════════════════════╗', 'cyan'));
  console.log(
    colorize('║              SearXNG CLI Settings                          ║', 'bold,brightGreen')
  );
  console.log(colorize('╚════════════════════════════════════════════════════════════╝', 'cyan'));
  console.log();

  console.log(colorize('Connection:', 'yellow,bold'));
  console.log(`  SearXNG URL: ${settings.searxngUrl}`);
  console.log();

  console.log(colorize('Output:', 'yellow,bold'));
  console.log(`  Default format: ${settings.defaultFormat}`);
  console.log(`  Default limit: ${settings.defaultLimit}`);
  console.log(`  Theme: ${settings.theme}`);
  console.log(`  Show scores: ${settings.showScores}`);
  console.log();

  console.log(colorize('Behavior:', 'yellow,bold'));
  console.log(`  Save history: ${settings.saveHistory}`);
  console.log(`  Max history: ${settings.maxHistory}`);
  console.log(`  Auto-format: ${settings.autoFormat}`);
  console.log(`  Auto-unescape HTML: ${settings.autoUnescape}`);
  console.log(`  Force local routing: ${settings.forceLocalRouting}`);
  console.log(`  Force local agent routing: ${settings.forceLocalAgentRouting}`);
  console.log();

  console.log(colorize('Advanced:', 'yellow,bold'));
  console.log(`  Default timeout: ${settings.defaultTimeout}ms`);
  console.log(`  Default engines: ${settings.defaultEngines ?? '(none)'}`);
  console.log(`  Default category: ${settings.defaultCategory ?? '(none)'}`);
  const paramEntries = Object.entries(settings.defaultSearxngParams);
  if (paramEntries.length === 0) {
    console.log('  Default SearXNG params: (none)');
  } else {
    console.log(
      `  Default SearXNG params: ${paramEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`
    );
  }
  console.log();

  console.log(colorize('Setup Info:', 'yellow,bold'));
  console.log(`  Setup version: ${settings.lastSetupVersion}`);
  console.log(`  Setup completed: ${settings.setupCompletedAt}`);
  console.log();

  console.log(colorize(`Settings file: ${SETTINGS_FILE}`, 'dim'));
  console.log(colorize(`Config directory: ${CONFIG_DIR}`, 'dim'));
  console.log();
  console.log(colorize('To change settings:', 'cyan'));
  console.log('  searxng --set-url <url>        Set SearXNG instance URL');
  console.log('  searxng --set-local-url         Reset SearXNG URL to local default');
  console.log('  searxng --set-limit <n>         Set default result limit');
  console.log('  searxng --set-format <fmt>      Set default output format');
  console.log('  searxng --set-theme <theme>     Set color theme');
  console.log('  searxng --set-engines <list>    Set default engines');
  console.log('  searxng --set-timeout <ms>      Set default timeout');
  console.log('  searxng --set-history <on|off>   Enable/disable history');
  console.log('  searxng --set-force-local-routing <on|off>');
  console.log('  searxng --set-force-local-agent-routing <on|off>');
  console.log('  searxng --set-param <k=v>       Set default SearXNG passthrough param');
  console.log('  searxng --set-params-json <obj>  Replace default params with JSON object');
  console.log('  searxng --set-params-query <q>   Replace default params with URL query string');
  console.log('  searxng --unset-param <key>     Remove default SearXNG passthrough param');
  console.log('  searxng --clear-params          Clear all default passthrough params');
  console.log('  searxng --setup                  Run full setup wizard');
}

export function updateSetting(key: string, value: string): boolean {
  const settings = loadSettings();
  const validThemes = ['default', 'ocean', 'forest', 'sunset', 'mono'];

  switch (key) {
    case 'url':
    case 'searxngUrl':
      const normalized = normalizeSearxngUrl(value);
      if (!normalized) {
        console.error(colorize(`Error: Invalid URL "${value}"`, 'red'));
        return false;
      }
      settings.searxngUrl = normalized;
      setSearxngUrl(normalized);
      break;
    case 'limit':
    case 'defaultLimit':
      const limit = parseInt(value, 10);
      if (isNaN(limit) || limit < 0) {
        console.error(
          colorize(`Error: Invalid limit "${value}". Must be a positive number.`, 'red')
        );
        return false;
      }
      settings.defaultLimit = limit;
      break;
    case 'format':
    case 'defaultFormat':
      if (!VALID_SETTINGS_FORMATS.includes(value.toLowerCase())) {
        console.error(
          colorize(
            `Error: Invalid format "${value}". Valid formats: ${VALID_SETTINGS_FORMATS.join(', ')}`,
            'red'
          )
        );
        return false;
      }
      settings.defaultFormat = normalizeOutputFormat(value);
      break;
    case 'theme':
      if (!validThemes.includes(value.toLowerCase())) {
        console.error(
          colorize(
            `Error: Invalid theme "${value}". Valid themes: ${validThemes.join(', ')}`,
            'red'
          )
        );
        return false;
      }
      settings.theme = value.toLowerCase() as Settings['theme'];
      break;
    case 'engines':
    case 'defaultEngines':
      settings.defaultEngines = value || null;
      break;
    case 'timeout':
    case 'defaultTimeout':
      const timeout = parseInt(value, 10);
      if (isNaN(timeout) || timeout < 1000) {
        console.error(
          colorize(`Error: Invalid timeout "${value}". Must be at least 1000ms.`, 'red')
        );
        return false;
      }
      settings.defaultTimeout = timeout;
      break;
    case 'history':
    case 'saveHistory':
      settings.saveHistory =
        value.toLowerCase() === 'on' || value.toLowerCase() === 'true' || value === '1';
      break;
    case 'forceLocalRouting':
      settings.forceLocalRouting =
        value.toLowerCase() === 'on' || value.toLowerCase() === 'true' || value === '1';
      break;
    case 'forceLocalAgentRouting':
      settings.forceLocalAgentRouting =
        value.toLowerCase() === 'on' || value.toLowerCase() === 'true' || value === '1';
      break;
    case 'maxHistory':
      const maxHist = parseInt(value, 10);
      if (isNaN(maxHist) || maxHist < 1) {
        console.error(
          colorize(`Error: Invalid max history "${value}". Must be a positive number.`, 'red')
        );
        return false;
      }
      settings.maxHistory = maxHist;
      break;
    case 'setParam':
      const separatorIndex = value.indexOf('=');
      if (separatorIndex <= 0) {
        console.error(colorize(`Error: Invalid param "${value}". Expected key=value`, 'red'));
        return false;
      }
      const setParamKey = value.slice(0, separatorIndex).trim();
      const setParamValue = value.slice(separatorIndex + 1).trim();
      if (!setParamKey) {
        console.error(colorize('Error: Param key cannot be empty', 'red'));
        return false;
      }
      settings.defaultSearxngParams[setParamKey] = setParamValue;
      break;
    case 'setParamsJson':
      const parsedJsonParams = parseSearxngParamsJson(value);
      if (!parsedJsonParams) {
        return false;
      }
      settings.defaultSearxngParams = parsedJsonParams;
      break;
    case 'setParamsQuery':
      const parsedQueryParams = parseSearxngParamsQuery(value);
      if (!parsedQueryParams) {
        return false;
      }
      settings.defaultSearxngParams = parsedQueryParams;
      break;
    case 'unsetParam':
      const unsetParamKey = value.trim();
      if (!unsetParamKey) {
        console.error(colorize('Error: Param key cannot be empty', 'red'));
        return false;
      }
      delete settings.defaultSearxngParams[unsetParamKey];
      break;
    case 'clearParams':
      settings.defaultSearxngParams = {};
      break;
    default:
      console.error(colorize(`Error: Unknown setting "${key}"`, 'red'));
      console.log(
        colorize(
          'Valid settings: url, limit, format, theme, engines, timeout, history, maxHistory, forceLocalRouting, forceLocalAgentRouting, setParam, setParamsJson, setParamsQuery, unsetParam, clearParams',
          'yellow'
        )
      );
      return false;
  }

  settings.lastSetupVersion = VERSION;
  saveSettings(settings);
  console.log(colorize(`\n✓ Updated ${key} to: ${value}`, 'green'));
  console.log(colorize(`  Settings saved to: ${SETTINGS_FILE}`, 'dim'));
  return true;
}
