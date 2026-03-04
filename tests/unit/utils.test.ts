import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  colorize,
  truncate,
  stripHtml,
  unescapeHtml,
  escapeHtml,
  formatDuration,
  formatBytes,
  formatDate,
  wrapText,
  highlightTerms,
  escapeRegex,
  sleep,
  calculateBackoff,
  getDomain,
  isNonEmptyString,
  isNumber,
  safeJsonParse,
  sanitizeJsonString,
  safeJsonStringify,
  embedText,
  cosineSimilarity,
} from '@/utils/index';

describe('Utils Module', () => {
  describe('colorize', () => {
    it('should return text unchanged when NO_COLOR is set', () => {
      vi.stubEnv('NO_COLOR', '1');
      const result = colorize('test', 'red');
      expect(result).toBe('test');
      vi.unstubAllEnvs();
    });

    it('should return text unchanged when not TTY', () => {
      const result = colorize('test', 'red');
      expect(typeof result).toBe('string');
    });

    it('should return empty string for empty input', () => {
      expect(colorize('', 'red')).toBe('');
    });

    it('should colorize text when TTY is true and NO_COLOR is not set', () => {
      vi.stubEnv('NO_COLOR', '');
      const originalIsTTY = process.stdout.isTTY;
      process.stdout.isTTY = true;
      const result = colorize('test', 'red');
      expect(result).toContain('test');
      expect(result).not.toBe('test');
      process.stdout.isTTY = originalIsTTY;
      vi.unstubAllEnvs();
    });
  });

  describe('truncate', () => {
    it('should return empty string for null/undefined', () => {
      expect(truncate(null as unknown as string)).toBe('');
      expect(truncate(undefined as unknown as string)).toBe('');
    });

    it('should not truncate short strings', () => {
      expect(truncate('short', 100)).toBe('short');
    });

    it('should truncate long strings with ellipsis', () => {
      const longString = 'a'.repeat(150);
      expect(truncate(longString, 100)).toBe('a'.repeat(100) + '...');
    });

    it('should use default max length of 100', () => {
      const longString = 'a'.repeat(150);
      expect(truncate(longString)).toBe('a'.repeat(100) + '...');
    });
  });

  describe('stripHtml', () => {
    it('should return empty string for null/undefined', () => {
      expect(stripHtml(null as unknown as string)).toBe('');
      expect(stripHtml(undefined as unknown as string)).toBe('');
    });

    it('should remove HTML tags', () => {
      expect(stripHtml('<p>Hello <b>World</b></p>')).toBe('Hello World');
    });

    it('should normalize whitespace', () => {
      expect(stripHtml('Hello   World')).toBe('Hello World');
    });
  });

  describe('unescapeHtml', () => {
    it('should return input unchanged for null/undefined', () => {
      expect(unescapeHtml(null as unknown as string)).toBe(null);
      expect(unescapeHtml(undefined as unknown as string)).toBe(undefined);
    });

    it('should unescape common HTML entities', () => {
      expect(unescapeHtml('&amp;')).toBe('&');
      expect(unescapeHtml('&lt;')).toBe('<');
      expect(unescapeHtml('&gt;')).toBe('>');
      expect(unescapeHtml('&quot;')).toBe('"');
    });

    it('should handle multiple entities', () => {
      expect(unescapeHtml('&lt;div&gt;Hello&amp;World&lt;/div&gt;')).toBe('<div>Hello&World</div>');
    });
  });

  describe('escapeHtml', () => {
    it('should return empty string for null/undefined', () => {
      expect(escapeHtml(null as unknown as string)).toBe('');
      expect(escapeHtml(undefined as unknown as string)).toBe('');
    });

    it('should escape special characters', () => {
      expect(escapeHtml('<div>"test"&\'value\'</div>')).toBe(
        '&lt;div&gt;&quot;test&quot;&amp;&#039;value&#039;&lt;/div&gt;'
      );
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds less than 1000', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(1)).toBe('1ms');
    });

    it('should format seconds for 1000 or more milliseconds', () => {
      expect(formatDuration(1000)).toBe('1.00s');
      expect(formatDuration(1500)).toBe('1.50s');
      expect(formatDuration(1234)).toBe('1.23s');
    });
  });

  describe('formatBytes', () => {
    it('should return 0 Bytes for 0', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('should format bytes', () => {
      expect(formatBytes(500)).toBe('500 Bytes');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
    });
  });

  describe('formatDate', () => {
    it('should return empty string for null/undefined', () => {
      expect(formatDate(null as unknown as string)).toBe('');
      expect(formatDate(undefined as unknown as string)).toBe('');
    });

    it('should return input for invalid date', () => {
      expect(formatDate('invalid')).toBe('invalid');
    });

    it('should format valid dates', () => {
      const result = formatDate('2024-01-15');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('wrapText', () => {
    it('should return empty string for null/undefined', () => {
      expect(wrapText(null as unknown as string, 80)).toBe('');
      expect(wrapText(undefined as unknown as string, 80)).toBe('');
    });

    it('should wrap text at word boundaries', () => {
      const text = 'a '.repeat(20);
      const result = wrapText(text, 20);
      expect(result).toBeTruthy();
    });

    it('should not break words that fit', () => {
      const result = wrapText('short text', 100);
      expect(result).toBe('short text');
    });
  });

  describe('highlightTerms', () => {
    it('should return text unchanged for empty query', () => {
      expect(highlightTerms('test text', '')).toBe('test text');
    });

    it('should highlight matching terms', () => {
      const result = highlightTerms('Hello World Test', 'world', 'yellow');
      expect(result).toContain('World');
    });
  });

  describe('escapeRegex', () => {
    it('should escape special regex characters', () => {
      expect(escapeRegex('test.*+?^${}()|[]\\')).toBe(
        'test\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\'
      );
    });

    it('should not modify normal strings', () => {
      expect(escapeRegex('normal text')).toBe('normal text');
    });
  });

  describe('sleep', () => {
    it('should resolve after specified milliseconds', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff', () => {
      const delay0 = calculateBackoff(0, 100, 10000);
      const delay1 = calculateBackoff(1, 100, 10000);
      expect(delay1).toBeGreaterThan(delay0);
    });

    it('should not exceed max delay', () => {
      const delay = calculateBackoff(20, 100, 1000);
      expect(delay).toBeLessThanOrEqual(1100);
    });
  });

  describe('getDomain', () => {
    it('should extract domain from URL', () => {
      expect(getDomain('https://www.example.com/path')).toBe('example.com');
      expect(getDomain('http://example.com')).toBe('example.com');
    });

    it('should return empty string for invalid URL', () => {
      expect(getDomain('not a url')).toBe('');
    });
  });

  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('test')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isNonEmptyString('')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('should return true for valid numbers', () => {
      expect(isNumber(123)).toBe(true);
      expect(isNumber(0)).toBe(true);
      expect(isNumber(-5)).toBe(true);
    });

    it('should return false for NaN', () => {
      expect(isNumber(NaN)).toBe(false);
    });

    it('should return false for Infinity', () => {
      expect(isNumber(Infinity)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isNumber('123')).toBe(false);
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      expect(safeJsonParse('{"key":"value"}', {})).toEqual({ key: 'value' });
    });

    it('should return fallback for invalid JSON', () => {
      expect(safeJsonParse('invalid', { default: true })).toEqual({ default: true });
    });
  });

  describe('sanitizeJsonString', () => {
    it('should replace disallowed control characters', () => {
      expect(sanitizeJsonString('abc\u0000def\u0007')).toBe('abc def ');
    });

    it('should preserve valid surrogate pairs', () => {
      expect(sanitizeJsonString('emoji \uD83D\uDE00')).toBe('emoji \uD83D\uDE00');
    });

    it('should replace lone surrogates', () => {
      expect(sanitizeJsonString('bad\uD800x\uDC00')).toBe('bad�x�');
    });
  });

  describe('safeJsonStringify', () => {
    it('should convert unsupported number values to null', () => {
      const out = safeJsonStringify({ a: Infinity, b: -Infinity, c: NaN });
      expect(JSON.parse(out)).toEqual({ a: null, b: null, c: null });
    });

    it('should sanitize malformed strings', () => {
      const out = safeJsonStringify({ x: 'a\u0000b\uD800' });
      expect(JSON.parse(out)).toEqual({ x: 'a b\uFFFD' });
    });

    it('should serialize bigint values as strings', () => {
      const out = safeJsonStringify({ x: BigInt(42) });
      expect(JSON.parse(out)).toEqual({ x: '42' });
    });
  });

  describe('embedText', () => {
    it('should return a 64-dimensional vector of numbers', () => {
      const vec = embedText('test');
      expect(vec).toHaveLength(64);
      vec.forEach((v) => expect(typeof v).toBe('number'));
    });

    it('should return a normalized vector', () => {
      const vec = embedText('hello world');
      const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
      // floating point precision might make it not exactly 1
      expect(magnitude).toBeGreaterThan(0.99);
      expect(magnitude).toBeLessThan(1.01);
    });

    it('should return zero vector for empty string', () => {
      const vec = embedText('');
      expect(vec).toHaveLength(64);
      expect(vec.every((v) => v === 0)).toBe(true);
    });
  });

  describe('cosineSimilarity', () => {
    it('should calculate correct similarity', () => {
      const vecA = [1, 0];
      const vecB = [0, 1];
      expect(cosineSimilarity(vecA, vecB)).toBe(0);

      const vecC = [1, 0];
      const vecD = [1, 0];
      expect(cosineSimilarity(vecC, vecD)).toBe(1);

      const vecE = [1, 1];
      const vecF = [-1, -1];
      expect(cosineSimilarity(vecE, vecF)).toBeCloseTo(-1); // or very close to it
    });

    it('should return 0 for vectors of different lengths', () => {
      expect(cosineSimilarity([1], [1, 0])).toBe(0);
    });

    it('should return 0 if one of the vectors is zero-vector', () => {
      expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
      expect(cosineSimilarity([1, 1], [0, 0])).toBe(0);
    });
  });
});
