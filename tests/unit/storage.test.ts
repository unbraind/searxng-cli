import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ensureConfigDir,
  loadConfig,
  saveConfig,
  loadHistory,
  saveHistory,
  addToHistory,
  loadBookmarks,
  saveBookmarks,
  addBookmark,
  loadPresets,
  savePresets,
  addPreset,
  loadSuggestions,
  saveSuggestions,
  updateSuggestions,
  bootstrapGlobalDataFiles,
  loadSettings,
  saveSettings,
  getDefaultSettings,
  applyLocalAgentDefaults,
  isSetupComplete,
  markSetupComplete,
  testConnection,
  showSearchHistory,
  showBookmarks,
  manageConfig,
  showSettings,
  updateSetting,
} from '@/storage/index';
import type { AppConfig, HistoryEntry, BookmarkEntry, SearchResult, Settings } from '@/types/index';
import {
  CONFIG_DIR,
  HISTORY_FILE,
  BOOKMARKS_FILE,
  PRESETS_FILE,
  SUGGESTIONS_FILE,
  CONFIG_FILE,
  SETTINGS_FILE,
  SETUP_COMPLETE_FILE,
  CACHE_FILE,
  ENGINES_CACHE_FILE,
} from '@/config/index';

const createMockResult = (overrides: Partial<SearchResult> = {}): SearchResult => ({
  title: 'Test Result',
  url: 'https://example.com/test',
  content: 'Test content',
  ...overrides,
});

describe('Storage Module', () => {
  beforeEach(() => {
    if (fs.existsSync(CONFIG_DIR)) {
      const files = [
        HISTORY_FILE,
        BOOKMARKS_FILE,
        PRESETS_FILE,
        SUGGESTIONS_FILE,
        CONFIG_FILE,
        SETTINGS_FILE,
        SETUP_COMPLETE_FILE,
        CACHE_FILE,
        ENGINES_CACHE_FILE,
      ];
      for (const file of files) {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      }
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ensureConfigDir', () => {
    it('should create config directory if it does not exist', () => {
      const newDir = path.join(os.tmpdir(), 'searxng-cli-new-' + Date.now());
      vi.doMock('../src/config', () => ({ CONFIG_DIR: newDir }));

      if (fs.existsSync(newDir)) {
        fs.rmdirSync(newDir);
      }

      expect(fs.existsSync(newDir)).toBe(false);
    });

    it('should not throw if directory already exists', () => {
      expect(() => ensureConfigDir()).not.toThrow();
    });
  });

  describe('bootstrapGlobalDataFiles', () => {
    it('should create all managed global data files with defaults', () => {
      bootstrapGlobalDataFiles();

      expect(fs.existsSync(HISTORY_FILE)).toBe(true);
      expect(fs.existsSync(BOOKMARKS_FILE)).toBe(true);
      expect(fs.existsSync(PRESETS_FILE)).toBe(true);
      expect(fs.existsSync(SUGGESTIONS_FILE)).toBe(true);
      expect(fs.existsSync(CACHE_FILE)).toBe(true);
      expect(fs.existsSync(ENGINES_CACHE_FILE)).toBe(true);

      expect(JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'))).toEqual([]);
      expect(JSON.parse(fs.readFileSync(BOOKMARKS_FILE, 'utf8'))).toEqual([]);
      expect(JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf8'))).toEqual({});
      expect(JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8'))).toEqual({
        popular: [],
        recent: [],
      });
      expect(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))).toEqual({});

      const engines = JSON.parse(fs.readFileSync(ENGINES_CACHE_FILE, 'utf8')) as {
        timestamp: number;
        engines: unknown[];
        categories: unknown[];
      };
      expect(engines.timestamp).toBe(0);
      expect(Array.isArray(engines.engines)).toBe(true);
      expect(Array.isArray(engines.categories)).toBe(true);
    });
  });

  describe('loadConfig and saveConfig', () => {
    it('should return default config when no config file exists', () => {
      const config = loadConfig();
      expect(config.defaultLimit).toBe(10);
      expect(config.defaultFormat).toBe('toon');
      expect(config.saveHistory).toBe(true);
    });

    it('should save and load config', () => {
      const config: AppConfig = {
        defaultLimit: 20,
        defaultFormat: 'json',
        defaultTimeout: 30000,
        autoUnescape: false,
        autoFormat: true,
        colorize: true,
        showScores: false,
        saveHistory: false,
        maxHistory: 50,
        defaultEngines: 'google',
        defaultCategory: 'images',
        theme: 'ocean',
      };

      saveConfig(config);
      const loaded = loadConfig();

      expect(loaded.defaultLimit).toBe(20);
      expect(loaded.defaultFormat).toBe('json');
      expect(loaded.saveHistory).toBe(false);
    });

    it('should handle malformed config file', () => {
      fs.writeFileSync(CONFIG_FILE, 'invalid json{');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const config = loadConfig();

      expect(config.defaultFormat).toBe('toon');
      consoleSpy.mockRestore();
    });
  });

  describe('loadHistory and saveHistory', () => {
    it('should return empty array when no history file exists', () => {
      const history = loadHistory();
      expect(history).toEqual([]);
    });

    it('should save and load history', () => {
      const history: HistoryEntry[] = [
        { query: 'test query 1', timestamp: '2024-01-01T00:00:00.000Z' },
        { query: 'test query 2', timestamp: '2024-01-02T00:00:00.000Z' },
      ];

      saveHistory(history);
      const loaded = loadHistory();

      expect(loaded.length).toBe(2);
      expect(loaded[0]?.query).toBe('test query 1');
    });

    it('should trim history to maxHistory', () => {
      saveConfig({ ...loadConfig(), maxHistory: 5 });

      const history: HistoryEntry[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({ query: `query ${i}`, timestamp: new Date().toISOString() });
      }

      saveHistory(history);
      const loaded = loadHistory();

      expect(loaded.length).toBe(5);
    });
  });

  describe('addToHistory', () => {
    it('should add entry to history', () => {
      saveConfig({ ...loadConfig(), saveHistory: true });
      addToHistory('new query');

      const history = loadHistory();
      expect(history.some((h) => h.query === 'new query')).toBe(true);
    });

    it('should not add to history when saveHistory is false', () => {
      saveConfig({ ...loadConfig(), saveHistory: false });
      const before = loadHistory().length;

      addToHistory('another query');

      const after = loadHistory().length;
      expect(after).toBe(before);
    });
  });

  describe('loadBookmarks and saveBookmarks', () => {
    it('should return empty array when no bookmarks file exists', () => {
      const bookmarks = loadBookmarks();
      expect(bookmarks).toEqual([]);
    });

    it('should save and load bookmarks', () => {
      const bookmarks: BookmarkEntry[] = [
        { ...createMockResult(), title: 'Bookmark 1', bookmarkedAt: '2024-01-01T00:00:00.000Z' },
        { ...createMockResult(), title: 'Bookmark 2', bookmarkedAt: '2024-01-02T00:00:00.000Z' },
      ];

      saveBookmarks(bookmarks);
      const loaded = loadBookmarks();

      expect(loaded.length).toBe(2);
      expect(loaded[0]?.title).toBe('Bookmark 1');
    });
  });

  describe('addBookmark', () => {
    it('should add bookmark', () => {
      const result = createMockResult({ title: 'Test Bookmark' });
      const count = addBookmark(result);

      expect(count).toBe(1);

      const bookmarks = loadBookmarks();
      expect(bookmarks[0]?.title).toBe('Test Bookmark');
      expect(bookmarks[0]?.bookmarkedAt).toBeDefined();
    });
  });

  describe('loadPresets and savePresets', () => {
    it('should return empty object when no presets file exists', () => {
      const presets = loadPresets();
      expect(presets).toEqual({});
    });

    it('should save and load presets', () => {
      const presets = {
        'dev-search': {
          engines: 'github,stackoverflow',
          limit: 20,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      };

      savePresets(presets);
      const loaded = loadPresets();

      expect(loaded['dev-search']).toBeDefined();
      expect(loaded['dev-search']?.engines).toBe('github,stackoverflow');
    });
  });

  describe('addPreset', () => {
    it('should add preset', () => {
      const options = { engines: 'google', limit: 15 };
      const count = addPreset('test-preset', options);

      expect(count).toBe(1);

      const presets = loadPresets();
      expect(presets['test-preset']).toBeDefined();
      expect(presets['test-preset']?.engines).toBe('google');
      expect(presets['test-preset']?.createdAt).toBeDefined();
    });
  });

  describe('loadSuggestions and saveSuggestions', () => {
    it('should return default suggestions when no file exists', () => {
      const suggestions = loadSuggestions();
      expect(suggestions.popular).toEqual([]);
      expect(suggestions.recent).toEqual([]);
    });

    it('should save and load suggestions', () => {
      const suggestions = {
        popular: ['query1', 'query2'],
        recent: ['query3', 'query4'],
      };

      saveSuggestions(suggestions);
      const loaded = loadSuggestions();

      expect(loaded.popular).toEqual(['query1', 'query2']);
      expect(loaded.recent).toEqual(['query3', 'query4']);
    });
  });

  describe('updateSuggestions', () => {
    it('should add query to recent', () => {
      updateSuggestions('test query');
      const suggestions = loadSuggestions();

      expect(suggestions.recent).toContain('test query');
    });

    it('should not duplicate recent queries', () => {
      updateSuggestions('duplicate');
      updateSuggestions('duplicate');
      const suggestions = loadSuggestions();

      const count = suggestions.recent.filter((q) => q === 'duplicate').length;
      expect(count).toBe(1);
    });

    it('should update popular queries', () => {
      updateSuggestions('popular1');
      updateSuggestions('popular1');
      updateSuggestions('popular1');
      updateSuggestions('popular2');

      const suggestions = loadSuggestions();
      expect(suggestions.popular[0]).toBe('popular1');
    });

    it('should limit recent queries to 50', () => {
      for (let i = 0; i < 60; i++) {
        updateSuggestions(`query${i}`);
      }

      const suggestions = loadSuggestions();
      expect(suggestions.recent.length).toBeLessThanOrEqual(50);
    });
  });

  describe('loadSettings and saveSettings', () => {
    it('should return default settings when no settings file exists', () => {
      if (fs.existsSync(SETTINGS_FILE)) {
        fs.unlinkSync(SETTINGS_FILE);
      }
      const settings = loadSettings();
      expect(settings.defaultFormat).toBe('toon');
      expect(settings.defaultLimit).toBe(10);
      expect(settings.searxngUrl).toBeDefined();
      expect(fs.existsSync(SETTINGS_FILE)).toBe(true);
    });

    it('should save and load settings', () => {
      const settings: Settings = {
        searxngUrl: 'http://test.local:8080',
        defaultLimit: 25,
        defaultFormat: 'json',
        defaultTimeout: 20000,
        autoUnescape: false,
        autoFormat: true,
        colorize: true,
        showScores: true,
        saveHistory: true,
        maxHistory: 200,
        defaultEngines: 'bing',
        defaultCategory: 'news',
        theme: 'ocean',
        forceLocalRouting: true,
        forceLocalAgentRouting: true,
        lastSetupVersion: '19.0.0',
        setupCompletedAt: '2024-01-01T00:00:00.000Z',
      };

      saveSettings(settings);
      const loaded = loadSettings();

      expect(loaded.searxngUrl).toBe('http://test.local:8080');
      expect(loaded.defaultLimit).toBe(25);
      expect(loaded.defaultFormat).toBe('json');
      expect(loaded.theme).toBe('ocean');
    });

    it('should merge with defaults for partial settings', () => {
      const partialSettings = {
        searxngUrl: 'http://custom.url',
        defaultLimit: 50,
      };

      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(partialSettings));
      const loaded = loadSettings();

      expect(loaded.searxngUrl).toBe('http://custom.url');
      expect(loaded.defaultLimit).toBe(50);
      expect(loaded.defaultFormat).toBe('toon');
    });
  });

  describe('getDefaultSettings', () => {
    it('should return valid default settings', () => {
      const defaults = getDefaultSettings();

      expect(defaults.defaultFormat).toBe('toon');
      expect(defaults.defaultLimit).toBe(10);
      expect(defaults.saveHistory).toBe(true);
      expect(defaults.searxngUrl).toBeDefined();
      expect(defaults.theme).toBe('default');
      expect(defaults.defaultSearxngParams).toEqual({});
      expect(defaults.forceLocalRouting).toBe(true);
      expect(defaults.forceLocalAgentRouting).toBe(true);
    });
  });

  describe('applyLocalAgentDefaults', () => {
    it('should force local URL and TOON defaults', () => {
      saveSettings({
        ...getDefaultSettings(),
        searxngUrl: 'https://example.com',
        defaultFormat: 'json',
        defaultLimit: 42,
      });

      const updated = applyLocalAgentDefaults();

      expect(updated.searxngUrl).toBe('http://localhost:8080');
      expect(updated.defaultFormat).toBe('toon');
      expect(updated.defaultLimit).toBe(10);
      expect(updated.forceLocalRouting).toBe(true);
      expect(updated.forceLocalAgentRouting).toBe(true);
      expect(isSetupComplete()).toBe(true);
    });
  });

  describe('isSetupComplete and markSetupComplete', () => {
    it('should return false when setup not complete', () => {
      if (fs.existsSync(SETUP_COMPLETE_FILE)) {
        fs.unlinkSync(SETUP_COMPLETE_FILE);
      }
      expect(isSetupComplete()).toBe(false);
    });

    it('should mark setup as complete', () => {
      if (fs.existsSync(SETUP_COMPLETE_FILE)) {
        fs.unlinkSync(SETUP_COMPLETE_FILE);
      }

      markSetupComplete();
      expect(isSetupComplete()).toBe(true);
    });
  });

  describe('testConnection', () => {
    it('should return success for valid connection', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: true, status: 200 } as Response);
      try {
        const result = await testConnection('http://localhost:8080');
        expect(result.success).toBe(true);
        expect(result.latency).toBeGreaterThanOrEqual(0);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('should return failure for invalid connection', async () => {
      const result = await testConnection('http://invalid-host-that-does-not-exist:9999');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 15000);
  });

  describe('showSearchHistory', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should show "no history" message when history is empty', () => {
      if (fs.existsSync(HISTORY_FILE)) fs.unlinkSync(HISTORY_FILE);
      showSearchHistory();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should display history entries', () => {
      const history = [
        { query: 'test query 1', timestamp: new Date().toISOString() },
        { query: 'test query 2', timestamp: new Date().toISOString() },
      ];
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
      showSearchHistory();
      expect(consoleLogSpy).toHaveBeenCalled();
      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('test query');
    });

    it('should respect limit parameter', () => {
      const history = Array.from({ length: 30 }, (_, i) => ({
        query: `query${i}`,
        timestamp: new Date().toISOString(),
      }));
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
      showSearchHistory(5);
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('showBookmarks', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should show "no bookmarks" message when empty', () => {
      if (fs.existsSync(BOOKMARKS_FILE)) fs.unlinkSync(BOOKMARKS_FILE);
      showBookmarks();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should display bookmark entries', () => {
      const bookmarks = [
        {
          title: 'Bookmark 1',
          url: 'https://example.com/1',
          bookmarkedAt: new Date().toISOString(),
        },
      ];
      fs.writeFileSync(BOOKMARKS_FILE, JSON.stringify(bookmarks));
      showBookmarks();
      expect(consoleLogSpy).toHaveBeenCalled();
      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('Bookmark 1');
    });
  });

  describe('manageConfig', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should show config when action is "show"', () => {
      manageConfig('show');
      expect(consoleLogSpy).toHaveBeenCalled();
      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('Configuration');
    });

    it('should show config when action is empty string', () => {
      manageConfig('');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should reset config when action is "reset"', () => {
      manageConfig('reset');
      expect(consoleLogSpy).toHaveBeenCalled();
      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('reset');
    });

    it('should show error for unknown action', () => {
      manageConfig('unknown-action');
      expect(consoleLogSpy).toHaveBeenCalled();
      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('Unknown');
    });
  });

  describe('showSettings', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should display all settings sections', () => {
      showSettings();
      expect(consoleLogSpy).toHaveBeenCalled();
      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('Connection');
      expect(allOutput).toContain('Output');
      expect(allOutput).toContain('Behavior');
    });

    it('should show the settings file path', () => {
      showSettings();
      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('settings.json');
    });

    it('should display default passthrough params when configured', () => {
      updateSetting('setParam', 'theme=simple');
      showSettings();
      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('Default SearXNG params:');
      expect(allOutput).toContain('theme=simple');
    });
  });

  describe('updateSetting', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should update URL setting', () => {
      const result = updateSetting('url', 'http://newhost:9999');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.searxngUrl).toBe('http://newhost:9999');
    });

    it('should add protocol if missing from URL', () => {
      const result = updateSetting('url', 'myhost:9999');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.searxngUrl).toContain('http://');
    });

    it('should reject invalid URL setting', () => {
      const result = updateSetting('url', '://bad-url');
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should update limit setting', () => {
      const result = updateSetting('limit', '25');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.defaultLimit).toBe(25);
    });

    it('should reject invalid limit', () => {
      const result = updateSetting('limit', 'not-a-number');
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should update format setting', () => {
      const result = updateSetting('format', 'json');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.defaultFormat).toBe('json');
    });

    it('should normalize ndjson format setting to jsonl', () => {
      const result = updateSetting('format', 'ndjson');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.defaultFormat).toBe('jsonl');
    });

    it('should reject invalid format', () => {
      const result = updateSetting('format', 'invalid-format');
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should update theme setting', () => {
      const result = updateSetting('theme', 'ocean');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.theme).toBe('ocean');
    });

    it('should reject invalid theme', () => {
      const result = updateSetting('theme', 'invalid-theme');
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should update engines setting', () => {
      const result = updateSetting('engines', 'google,bing');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.defaultEngines).toBe('google,bing');
    });

    it('should set engines to null when empty string', () => {
      const result = updateSetting('engines', '');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.defaultEngines).toBeNull();
    });

    it('should update timeout setting', () => {
      const result = updateSetting('timeout', '30000');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.defaultTimeout).toBe(30000);
    });

    it('should reject invalid timeout (too low)', () => {
      const result = updateSetting('timeout', '100');
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should update history setting to on', () => {
      const result = updateSetting('history', 'on');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.saveHistory).toBe(true);
    });

    it('should update history setting to off', () => {
      const result = updateSetting('history', 'off');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.saveHistory).toBe(false);
    });

    it('should update forceLocalRouting setting', () => {
      const off = updateSetting('forceLocalRouting', 'off');
      expect(off).toBe(true);
      expect(loadSettings().forceLocalRouting).toBe(false);

      const on = updateSetting('forceLocalRouting', 'on');
      expect(on).toBe(true);
      expect(loadSettings().forceLocalRouting).toBe(true);
    });

    it('should update forceLocalAgentRouting setting', () => {
      const off = updateSetting('forceLocalAgentRouting', 'off');
      expect(off).toBe(true);
      expect(loadSettings().forceLocalAgentRouting).toBe(false);

      const on = updateSetting('forceLocalAgentRouting', 'on');
      expect(on).toBe(true);
      expect(loadSettings().forceLocalAgentRouting).toBe(true);
    });

    it('should update maxHistory setting', () => {
      const result = updateSetting('maxHistory', '200');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.maxHistory).toBe(200);
    });

    it('should reject invalid maxHistory', () => {
      const result = updateSetting('maxHistory', '-1');
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should reject unknown setting key', () => {
      const result = updateSetting('unknownKey', 'value');
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should accept searxngUrl as key', () => {
      const result = updateSetting('searxngUrl', 'http://alt.host:1234');
      expect(result).toBe(true);
    });

    it('should accept defaultLimit as key', () => {
      const result = updateSetting('defaultLimit', '15');
      expect(result).toBe(true);
    });

    it('should accept saveHistory as key with true', () => {
      const result = updateSetting('saveHistory', 'true');
      expect(result).toBe(true);
    });

    it('should accept saveHistory as key with 1', () => {
      const result = updateSetting('saveHistory', '1');
      expect(result).toBe(true);
    });

    it('should set a default passthrough param', () => {
      const result = updateSetting('setParam', 'theme=simple');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.defaultSearxngParams.theme).toBe('simple');
    });

    it('should reject an invalid default passthrough param format', () => {
      const result = updateSetting('setParam', 'invalid');
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should unset a default passthrough param', () => {
      updateSetting('setParam', 'theme=simple');
      const result = updateSetting('unsetParam', 'theme');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.defaultSearxngParams.theme).toBeUndefined();
    });

    it('should clear all default passthrough params', () => {
      updateSetting('setParam', 'theme=simple');
      updateSetting('setParam', 'image_proxy=true');
      const result = updateSetting('clearParams', '__clear__');
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.defaultSearxngParams).toEqual({});
    });

    it('should replace default passthrough params from JSON', () => {
      const result = updateSetting(
        'setParamsJson',
        '{"theme":"simple","enabled_plugins":"Hash_plugin","image_proxy":true}'
      );
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.defaultSearxngParams).toEqual({
        theme: 'simple',
        enabled_plugins: 'Hash_plugin',
        image_proxy: 'true',
      });
    });

    it('should reject invalid params JSON payload', () => {
      const result = updateSetting('setParamsJson', '{"theme":');
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should replace default passthrough params from URL query', () => {
      const result = updateSetting(
        'setParamsQuery',
        'theme=simple&enabled_plugins=Hash_plugin&image_proxy=true'
      );
      expect(result).toBe(true);
      const settings = loadSettings();
      expect(settings.defaultSearxngParams).toEqual({
        theme: 'simple',
        enabled_plugins: 'Hash_plugin',
        image_proxy: 'true',
      });
    });

    it('should reject empty params query payload', () => {
      const result = updateSetting('setParamsQuery', '   ');
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
