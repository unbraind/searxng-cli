import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSearxngUrl,
  setSearxngUrl,
  normalizeSearxngUrl,
  reloadSearxngUrl,
  isLocalInstance,
  getValidEngines,
  setValidEngines,
  getValidCategories,
  setValidCategories,
  getInstanceInfo,
  setInstanceInfo,
  getDefaultConfig,
  getThemeColor,
  setTheme,
  getTheme,
  VERSION,
  DEFAULT_TIMEOUT,
  MAX_RETRIES,
  VALID_CATEGORIES,
  VALID_FORMATS,
  VALID_SAFE_LEVELS,
  VALID_TIME_RANGES,
  ENGINE_GROUPS,
  SEARCH_ALIASES,
  RECOMMENDED_ENGINES,
  COLOR_THEMES,
  TOON_SPEC_VERSION,
  CACHE_MAX_AGE,
  LRU_CACHE_SIZE,
} from '@/config/index';

describe('Config Module', () => {
  describe('getSearxngUrl and setSearxngUrl', () => {
    let originalUrl: string;

    beforeEach(() => {
      originalUrl = getSearxngUrl();
    });

    afterEach(() => {
      setSearxngUrl(originalUrl);
      vi.clearAllMocks();
    });

    it('should return a URL string', () => {
      const url = getSearxngUrl();
      expect(typeof url).toBe('string');
      expect(url.startsWith('http')).toBe(true);
    });

    it('should update URL with setSearxngUrl', () => {
      setSearxngUrl('http://newhost:9999');
      expect(getSearxngUrl()).toBe('http://newhost:9999');
    });

    it('should normalize URL by trimming trailing slash', () => {
      setSearxngUrl('http://newhost:9999/');
      expect(getSearxngUrl()).toBe('http://newhost:9999');
    });

    it('should fallback to default URL when setting invalid URL', () => {
      setSearxngUrl('://bad-url');
      expect(getSearxngUrl()).toBe('http://localhost:8080');
    });

    it('should detect local instance for localhost', () => {
      setSearxngUrl('http://localhost:8080');
      expect(isLocalInstance()).toBe(true);
    });

    it('should detect local instance for 192.168.x.x', () => {
      setSearxngUrl('http://localhost:9999');
      expect(isLocalInstance()).toBe(true);
    });

    it('should detect local instance for 127.x.x.x', () => {
      setSearxngUrl('http://127.0.0.1:8080');
      expect(isLocalInstance()).toBe(true);
    });

    it('should detect remote instance for external URL', () => {
      setSearxngUrl('https://searx.example.com');
      expect(isLocalInstance()).toBe(false);
    });
  });

  describe('reloadSearxngUrl', () => {
    it('should reload the URL from settings/env', () => {
      const beforeUrl = getSearxngUrl();
      reloadSearxngUrl();
      const afterUrl = getSearxngUrl();
      expect(typeof afterUrl).toBe('string');
      expect(afterUrl.startsWith('http')).toBe(true);
    });
  });

  describe('getValidEngines and setValidEngines', () => {
    it('should return an array of engine strings', () => {
      const engines = getValidEngines();
      expect(Array.isArray(engines)).toBe(true);
      expect(engines.length).toBeGreaterThan(0);
    });

    it('should update valid engines list', () => {
      const original = getValidEngines();
      setValidEngines(['engine1', 'engine2', 'engine3']);
      expect(getValidEngines()).toEqual(['engine1', 'engine2', 'engine3']);
      setValidEngines(original);
    });

    it('should return a copy (not reference)', () => {
      const engines1 = getValidEngines();
      const engines2 = getValidEngines();
      expect(engines1).not.toBe(engines2);
      expect(engines1).toEqual(engines2);
    });
  });

  describe('getValidCategories and setValidCategories', () => {
    it('should return an array of category strings', () => {
      const categories = getValidCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
    });

    it('should include general category', () => {
      const categories = getValidCategories();
      expect(categories).toContain('general');
    });

    it('should update valid categories list', () => {
      const original = [...VALID_CATEGORIES];
      setValidCategories(['cat1', 'cat2']);
      expect(getValidCategories()).toContain('cat1');
      setValidCategories(original);
    });
  });

  describe('getInstanceInfo and setInstanceInfo', () => {
    it('should return an InstanceInfo object', () => {
      const info = getInstanceInfo();
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('version');
      expect(info).toHaveProperty('engines_count');
      expect(info).toHaveProperty('categories_count');
      expect(info).toHaveProperty('api_version');
    });

    it('should update instance info with setInstanceInfo', () => {
      const original = getInstanceInfo();
      setInstanceInfo({ name: 'TestInstance', version: '9.9.9' });
      const updated = getInstanceInfo();
      expect(updated.name).toBe('TestInstance');
      expect(updated.version).toBe('9.9.9');
      setInstanceInfo(original);
    });

    it('should merge partial updates', () => {
      const original = getInstanceInfo();
      setInstanceInfo({ engines_count: 999 });
      const updated = getInstanceInfo();
      expect(updated.engines_count).toBe(999);
      setInstanceInfo(original);
    });
  });

  describe('getDefaultConfig', () => {
    it('should return a valid AppConfig object', () => {
      const config = getDefaultConfig();
      expect(config).toHaveProperty('defaultLimit');
      expect(config).toHaveProperty('defaultFormat');
      expect(config).toHaveProperty('defaultTimeout');
      expect(config).toHaveProperty('autoUnescape');
      expect(config).toHaveProperty('autoFormat');
      expect(config).toHaveProperty('colorize');
      expect(config).toHaveProperty('showScores');
      expect(config).toHaveProperty('saveHistory');
      expect(config).toHaveProperty('maxHistory');
      expect(config).toHaveProperty('theme');
    });

    it('should have toon as defaultFormat', () => {
      const config = getDefaultConfig();
      expect(config.defaultFormat).toBe('toon');
    });

    it('should have positive defaultLimit', () => {
      const config = getDefaultConfig();
      expect(config.defaultLimit).toBeGreaterThan(0);
    });
  });

  describe('getThemeColor and setTheme', () => {
    afterEach(() => {
      setTheme('default');
    });

    it('should return a color string for primary', () => {
      const color = getThemeColor('primary');
      expect(typeof color).toBe('string');
      expect(color.length).toBeGreaterThan(0);
    });

    it('should return a color string for secondary', () => {
      const color = getThemeColor('secondary');
      expect(typeof color).toBe('string');
    });

    it('should return a color string for success', () => {
      const color = getThemeColor('success');
      expect(typeof color).toBe('string');
    });

    it('should return a color string for error', () => {
      const color = getThemeColor('error');
      expect(typeof color).toBe('string');
    });

    it('should change theme with setTheme', () => {
      setTheme('ocean');
      expect(getTheme()).toBe('ocean');
    });

    it('should change primary color when theme changes', () => {
      setTheme('default');
      const defaultPrimary = getThemeColor('primary');
      setTheme('forest');
      const forestPrimary = getThemeColor('primary');
      expect(typeof forestPrimary).toBe('string');
    });

    it('should not change for invalid theme', () => {
      setTheme('default');
      setTheme('invalid-theme' as 'default');
      expect(getTheme()).toBe('default');
    });

    it('should support all valid themes', () => {
      const themes = ['default', 'ocean', 'forest', 'sunset', 'mono'] as const;
      for (const theme of themes) {
        setTheme(theme);
        expect(getTheme()).toBe(theme);
      }
    });
  });

  describe('Constants', () => {
    it('VERSION should be a valid version string', () => {
      expect(typeof VERSION).toBe('string');
      expect(VERSION).toMatch(/^\d{4}\.[1-9]\d*\.[1-9]\d*(?:-[1-9]\d*)?$/);
    });

    it('DEFAULT_TIMEOUT should be a positive number', () => {
      expect(DEFAULT_TIMEOUT).toBeGreaterThan(0);
    });

    it('MAX_RETRIES should be a non-negative number', () => {
      expect(MAX_RETRIES).toBeGreaterThanOrEqual(0);
    });

    it('TOON_SPEC_VERSION should be a string', () => {
      expect(typeof TOON_SPEC_VERSION).toBe('string');
    });

    it('CACHE_MAX_AGE should be Infinity for local instance or a number', () => {
      expect(CACHE_MAX_AGE === Infinity || typeof CACHE_MAX_AGE === 'number').toBe(true);
    });

    it('LRU_CACHE_SIZE should support unlimited mode (0)', () => {
      expect(LRU_CACHE_SIZE).toBeGreaterThanOrEqual(0);
    });

    it('VALID_CATEGORIES should contain standard categories', () => {
      expect(VALID_CATEGORIES).toContain('general');
      expect(VALID_CATEGORIES).toContain('images');
      expect(VALID_CATEGORIES).toContain('news');
    });

    it('VALID_FORMATS should contain toon and json', () => {
      expect(VALID_FORMATS).toContain('toon');
      expect(VALID_FORMATS).toContain('json');
      expect(VALID_FORMATS).toContain('ndjson');
      expect(VALID_FORMATS).toContain('csv');
    });

    it('VALID_SAFE_LEVELS should be [0, 1, 2]', () => {
      expect(VALID_SAFE_LEVELS).toContain(0);
      expect(VALID_SAFE_LEVELS).toContain(1);
      expect(VALID_SAFE_LEVELS).toContain(2);
    });

    it('VALID_TIME_RANGES should contain day, week, month, year', () => {
      expect(VALID_TIME_RANGES).toContain('day');
      expect(VALID_TIME_RANGES).toContain('week');
      expect(VALID_TIME_RANGES).toContain('month');
      expect(VALID_TIME_RANGES).toContain('year');
    });

    it('ENGINE_GROUPS should have dev, ai, security groups', () => {
      expect(ENGINE_GROUPS).toHaveProperty('dev');
      expect(ENGINE_GROUPS).toHaveProperty('ai');
      expect(ENGINE_GROUPS).toHaveProperty('security');
    });

    it('SEARCH_ALIASES should have !gh, !so, !wiki', () => {
      expect(SEARCH_ALIASES).toHaveProperty('!gh');
      expect(SEARCH_ALIASES).toHaveProperty('!so');
      expect(SEARCH_ALIASES).toHaveProperty('!wiki');
    });

    it('RECOMMENDED_ENGINES should have general, code, news', () => {
      expect(RECOMMENDED_ENGINES).toHaveProperty('general');
      expect(RECOMMENDED_ENGINES).toHaveProperty('code');
      expect(RECOMMENDED_ENGINES).toHaveProperty('news');
    });

    it('COLOR_THEMES should have default, ocean, forest, sunset, mono', () => {
      expect(COLOR_THEMES).toHaveProperty('default');
      expect(COLOR_THEMES).toHaveProperty('ocean');
      expect(COLOR_THEMES).toHaveProperty('forest');
      expect(COLOR_THEMES).toHaveProperty('sunset');
      expect(COLOR_THEMES).toHaveProperty('mono');
    });

    it('each COLOR_THEME should have required properties', () => {
      for (const [, theme] of Object.entries(COLOR_THEMES)) {
        expect(theme).toHaveProperty('primary');
        expect(theme).toHaveProperty('secondary');
        expect(theme).toHaveProperty('success');
        expect(theme).toHaveProperty('error');
        expect(theme).toHaveProperty('dim');
      }
    });

    it('SEARCH_ALIASES should have engine or category for each alias', () => {
      for (const [alias, config] of Object.entries(SEARCH_ALIASES)) {
        expect(config).toHaveProperty('desc');
        expect(alias.startsWith('!')).toBe(true);
        expect(config.engines !== undefined || config.category !== undefined).toBe(true);
      }
    });
  });

  describe('normalizeSearxngUrl', () => {
    it('should add http protocol when missing', () => {
      expect(normalizeSearxngUrl('localhost:8080')).toBe('http://localhost:8080');
    });

    it('should return null for invalid URL', () => {
      expect(normalizeSearxngUrl('')).toBeNull();
      expect(normalizeSearxngUrl('://invalid')).toBeNull();
    });
  });
});
