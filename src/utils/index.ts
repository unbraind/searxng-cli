import { COLORS, getThemeColor } from '../config';
import type { ColorConfig } from '../types';

type ColorName = keyof ColorConfig;

export function colorize(text: string, color: string): string {
  if (!text) return '';
  if (process.env.NO_COLOR || !process.stdout.isTTY) return text;
  const codes = color
    .split(',')
    .map((c) => (COLORS as Record<string, string>)[c.trim()] ?? '')
    .join('');
  return `${codes}${text}${COLORS.reset}`;
}

export function truncate(str: string, maxLen = 100): string {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function unescapeHtml(text: string): string {
  if (!text) return text;
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&nbsp;': ' ',
    '&#x3D;': '=',
    '&#x2B;': '+',
    '&apos;': "'",
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
  };
  return text.replace(/&[^;]+;/g, (e) => entities[e] ?? e);
}

export function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDate(date: string | Date): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleString();
}

export function wrapText(text: string, width: number): string {
  if (!text) return '';
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.join('\n');
}

export function highlightTerms(text: string, query: string, color = 'yellow'): string {
  if (!text || !query) return text;
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  let result = text;
  for (const term of terms) {
    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
    result = result.replace(regex, colorize('$1', color));
  }
  return result;
}

export function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function calculateBackoff(attempt: number, baseDelay = 100, maxDelay = 10000): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  return delay + Math.random() * 100;
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function sanitizeJsonString(value: string): string {
  let result = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const char = value[i] ?? '';
    const isControl = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    if (isControl) {
      result += ' ';
      continue;
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      const nextCode = value.charCodeAt(i + 1);
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        result += char + (value[i + 1] ?? '');
        i++;
        continue;
      }
      result += '\uFFFD';
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      result += '\uFFFD';
      continue;
    }
    result += char;
  }
  return result;
}

export function safeJsonStringify(value: unknown, indent = 0): string {
  const serialized = JSON.stringify(
    value,
    (_key, currentValue: unknown) => {
      if (typeof currentValue === 'string') {
        return sanitizeJsonString(currentValue);
      }
      if (typeof currentValue === 'bigint') {
        return currentValue.toString();
      }
      if (typeof currentValue === 'number' && !Number.isFinite(currentValue)) {
        return null;
      }
      return currentValue;
    },
    indent
  );
  return serialized ?? 'null';
}

export function embedText(text: string): number[] {
  const dimensions = 64; // Lightweight vector dimension
  const vector = new Array(dimensions).fill(0);
  for (let i = 0; i < text.length; i++) {
    vector[i % dimensions] += text.charCodeAt(i);
  }
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return magnitude === 0 ? vector : vector.map((v) => Number((v / magnitude).toFixed(4)));
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i] ?? 0;
    const b = vecB[i] ?? 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
