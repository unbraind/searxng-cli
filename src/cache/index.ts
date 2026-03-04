import * as fs from 'fs';
import * as zlib from 'zlib';
import {
  LRU_CACHE_SIZE,
  CACHE_COMPRESSION,
  PERSISTENT_CACHE_ENABLED,
  CACHE_MAX_AGE,
  CACHE_FILE,
  SMART_DEDUP_ENABLED,
} from '../config';
import { colorize, formatDuration, formatBytes, truncate } from '../utils';
import { LRUCache, SmartDeduplicator } from '../classes';
import { embedText, cosineSimilarity } from '../utils';
import type {
  SearchResponse,
  CacheEntry,
  CacheStats,
  ExportResult,
  ImportResult,
  PruneResult,
  SearchOptions,
} from '../types';

export const smartDeduplicator = new SmartDeduplicator();
export const resultCache = new LRUCache<CacheEntry>(LRU_CACHE_SIZE);

export function loadCacheSync(): number {
  if (!PERSISTENT_CACHE_ENABLED) return 0;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const stat = fs.statSync(CACHE_FILE);
      if (stat.size > 5 * 1024 * 1024) {
        if (process.env.DEBUG) console.error('Cache file too large, skipping load');
        return 0;
      }
      let cacheData = fs.readFileSync(CACHE_FILE, 'utf8');
      if (CACHE_COMPRESSION) {
        try {
          const decompressed = zlib.inflateSync(Buffer.from(cacheData, 'base64'));
          cacheData = decompressed.toString('utf8');
        } catch {
          try {
            const parsed = JSON.parse(cacheData);
            if (typeof parsed === 'object' && parsed !== null) {
              const now = Date.now();
              let loadedCount = 0;
              for (const [key, entry] of Object.entries(parsed as Record<string, CacheEntry>)) {
                if (CACHE_MAX_AGE === Infinity || now - entry.timestamp <= CACHE_MAX_AGE) {
                  resultCache.set(key, entry);
                  loadedCount++;
                }
              }
              return loadedCount;
            }
          } catch {
            // Ignore parse errors
          }
          return 0;
        }
      }
      const cache = JSON.parse(cacheData) as Record<string, CacheEntry>;
      const now = Date.now();
      let loadedCount = 0;
      for (const [key, entry] of Object.entries(cache)) {
        if (CACHE_MAX_AGE === Infinity || now - entry.timestamp <= CACHE_MAX_AGE) {
          resultCache.set(key, entry);
          loadedCount++;
        }
      }
      return loadedCount;
    }
  } catch (e) {
    if (process.env.DEBUG) {
      console.error(`Cache load error: ${(e as Error).message}`);
    }
  }
  return 0;
}

export function saveCacheSync(): void {
  if (!PERSISTENT_CACHE_ENABLED) return;
  try {
    const cacheObj: Record<string, CacheEntry> = {};
    for (const [key, value] of resultCache.entries()) {
      cacheObj[key] = value;
    }
    let cacheStr = JSON.stringify(cacheObj, null, 2);
    if (CACHE_COMPRESSION) {
      cacheStr = zlib.deflateSync(cacheStr).toString('base64');
    }
    const tempFile = CACHE_FILE + '.tmp';
    fs.writeFileSync(tempFile, cacheStr);
    fs.renameSync(tempFile, CACHE_FILE);
  } catch {
    // Ignore save errors
  }
}

interface CacheKeyMetadata {
  query: string;
  category: string;
  lang: string;
  page: string;
  engines: string;
  timeRange: string;
  safeSearch: string;
  params: string;
}

function normalizeCacheParamPairs(
  params: Record<string, string> | undefined
): Array<[string, string]> {
  if (!params) return [];
  return Object.entries(params)
    .filter(([key]) => key.trim().length > 0)
    .map(([key, value]) => [key.trim(), String(value ?? '')] as [string, string])
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
}

function serializeCacheParams(params: Record<string, string> | undefined): string {
  const pairs = normalizeCacheParamPairs(params);
  if (pairs.length === 0) return 'none';
  return pairs.map(([key, value]) => `${key}=${value}`).join('&');
}

function getCacheKeyMetadata(query: string, options: SearchOptions): CacheKeyMetadata {
  return {
    query,
    category: options.category ?? 'general',
    lang: options.lang ?? 'en',
    page: String(options.page ?? 1),
    engines: options.engines ?? 'default',
    timeRange: options.timeRange ?? 'all',
    safeSearch: String(options.safeSearch ?? 0),
    params: serializeCacheParams(options.searxngParams),
  };
}

function parseCacheKey(key: string): CacheKeyMetadata {
  const defaults: CacheKeyMetadata = {
    query: key,
    category: 'general',
    lang: 'en',
    page: '1',
    engines: 'default',
    timeRange: 'all',
    safeSearch: '0',
    params: 'none',
  };

  if (key.startsWith('v2:')) {
    const parts = key.split(':');
    if (parts.length >= 9) {
      return {
        query: decodeURIComponent(parts[1] ?? ''),
        category: decodeURIComponent(parts[2] ?? 'general') || 'general',
        lang: decodeURIComponent(parts[3] ?? 'en') || 'en',
        page: decodeURIComponent(parts[4] ?? '1') || '1',
        engines: decodeURIComponent(parts[5] ?? 'default') || 'default',
        timeRange: decodeURIComponent(parts[6] ?? 'all') || 'all',
        safeSearch: decodeURIComponent(parts[7] ?? '0') || '0',
        params: decodeURIComponent(parts[8] ?? 'none') || 'none',
      };
    }
    return defaults;
  }

  const legacyParts = key.split(':');
  if (legacyParts.length < 6) {
    return defaults;
  }

  const timeRange = legacyParts[legacyParts.length - 1] ?? 'all';
  const engines = legacyParts[legacyParts.length - 2] ?? 'default';
  const page = legacyParts[legacyParts.length - 3] ?? '1';
  const lang = legacyParts[legacyParts.length - 4] ?? 'en';
  const category = legacyParts[legacyParts.length - 5] ?? 'general';
  const queryFromKey = legacyParts.slice(0, legacyParts.length - 5).join(':');

  return {
    query: queryFromKey || key,
    category,
    lang,
    page,
    engines,
    timeRange,
    safeSearch: '0',
    params: 'none',
  };
}

export function getCacheKey(query: string, options: SearchOptions): string {
  const metadata = getCacheKeyMetadata(query, options);
  return `v2:${encodeURIComponent(metadata.query)}:${encodeURIComponent(metadata.category)}:${encodeURIComponent(metadata.lang)}:${encodeURIComponent(metadata.page)}:${encodeURIComponent(metadata.engines)}:${encodeURIComponent(metadata.timeRange)}:${encodeURIComponent(metadata.safeSearch)}:${encodeURIComponent(metadata.params)}`;
}

export function getCachedResult(query: string, options: SearchOptions): SearchResponse | null {
  const key = getCacheKey(query, options);
  const entry = resultCache.get(key);
  if (entry) {
    if (CACHE_MAX_AGE === Infinity || Date.now() - entry.timestamp <= CACHE_MAX_AGE) {
      return { ...entry.data, _cached: true, _cacheAge: Date.now() - entry.timestamp };
    }
  }
  return null;
}

export function getSemanticCachedResult(
  query: string,
  options: SearchOptions,
  minSimilarity = 0.85
): SearchResponse | null {
  const queryEmbedding = embedText(query.toLowerCase());
  const requestMeta = getCacheKeyMetadata(query, options);
  let bestMatch: CacheEntry | null = null;
  let highestSimilarity = 0;

  for (const [key, entry] of resultCache.entries()) {
    const entryMeta = parseCacheKey(key);

    if (
      entryMeta.category === requestMeta.category &&
      entryMeta.lang === requestMeta.lang &&
      entryMeta.page === requestMeta.page &&
      entryMeta.engines === requestMeta.engines &&
      entryMeta.timeRange === requestMeta.timeRange &&
      entryMeta.safeSearch === requestMeta.safeSearch &&
      entryMeta.params === requestMeta.params
    ) {
      const entryQuery = entryMeta.query;
      const entryEmbedding = embedText(entryQuery.toLowerCase());
      const similarity = cosineSimilarity(queryEmbedding, entryEmbedding);

      if (similarity > highestSimilarity && similarity >= minSimilarity) {
        highestSimilarity = similarity;
        bestMatch = entry;
      }
    }
  }

  if (bestMatch) {
    if (CACHE_MAX_AGE === Infinity || Date.now() - bestMatch.timestamp <= CACHE_MAX_AGE) {
      return {
        ...bestMatch.data,
        _cached: true,
        _cacheAge: Date.now() - bestMatch.timestamp,
        _semantic: true,
        _similarity: highestSimilarity,
      };
    }
  }

  return null;
}

export function setCachedResult(query: string, options: SearchOptions, data: SearchResponse): void {
  const key = getCacheKey(query, options);
  resultCache.set(key, { timestamp: Date.now(), data });
  if (PERSISTENT_CACHE_ENABLED && resultCache.size % 5 === 0) {
    saveCacheSync();
  }
}

export function getCacheStats(): CacheStats {
  const isUnlimited = LRU_CACHE_SIZE <= 0;
  const stats: CacheStats = {
    entries: resultCache.size,
    maxSize: isUnlimited ? 'unlimited' : LRU_CACHE_SIZE,
    utilization: isUnlimited ? 'n/a' : ((resultCache.size / LRU_CACHE_SIZE) * 100).toFixed(1) + '%',
    persistent: PERSISTENT_CACHE_ENABLED,
    compressed: CACHE_COMPRESSION,
    maxAge: CACHE_MAX_AGE === Infinity ? 'Endless' : CACHE_MAX_AGE / 1000 + 's',
    file: CACHE_FILE,
    fileExists: fs.existsSync(CACHE_FILE),
    fileSize: 0,
    oldestEntry: null,
    newestEntry: null,
  };

  if (stats.fileExists) {
    try {
      stats.fileSize = formatBytes(fs.statSync(CACHE_FILE).size);
    } catch {
      // Ignore stat errors
    }
  }

  let oldest = Infinity;
  let newest = 0;
  for (const [, entry] of resultCache.entries()) {
    if (entry.timestamp) {
      if (entry.timestamp < oldest) oldest = entry.timestamp;
      if (entry.timestamp > newest) newest = entry.timestamp;
    }
  }

  if (oldest !== Infinity) {
    stats.oldestEntry = formatDuration(Date.now() - oldest) + ' ago';
    stats.newestEntry = formatDuration(Date.now() - newest) + ' ago';
  }

  return stats;
}

export function showCacheStatus(): void {
  const stats = getCacheStats();
  console.log(colorize('\n╔════════════════════════════════════════════════════════════╗', 'cyan'));
  console.log(
    colorize('║              Cache Status                                  ║', 'bold,brightGreen')
  );
  console.log(colorize('╚════════════════════════════════════════════════════════════╝', 'cyan'));
  console.log();
  console.log(colorize('Memory Cache:', 'yellow,bold'));
  if (stats.maxSize === 'unlimited') {
    console.log(`  Entries: ${stats.entries} (Unlimited)`);
  } else {
    console.log(`  Entries: ${stats.entries}/${stats.maxSize} (${stats.utilization})`);
  }
  if (stats.oldestEntry) {
    console.log(`  Oldest entry: ${stats.oldestEntry}`);
    console.log(`  Newest entry: ${stats.newestEntry}`);
  }
  console.log();
  console.log(colorize('Configuration:', 'yellow,bold'));
  console.log(`  Persistent: ${stats.persistent ? 'Enabled' : 'Disabled'}`);
  console.log(`  Compressed: ${stats.compressed ? 'Yes' : 'No'}`);
  console.log(`  Max age: ${stats.maxAge}`);
  console.log();
  console.log(colorize('Disk Cache:', 'yellow,bold'));
  console.log(`  File: ${stats.file}`);
  console.log(`  Exists: ${stats.fileExists ? 'Yes' : 'No'}`);
  if (stats.fileSize) console.log(`  Size: ${stats.fileSize}`);
  console.log();
}

export function clearCache(): void {
  resultCache.clear();
  smartDeduplicator.clear();
  try {
    fs.unlinkSync(CACHE_FILE);
  } catch {
    // Ignore unlink errors
  }
}

interface CacheListEntry {
  index: number;
  query: string;
  category: string;
  lang: string;
  page: string;
  engines: string;
  timeRange: string;
  safeSearch: string;
  params: string;
  timestamp: number;
  age: string;
  resultCount: number;
}

export function listCacheEntries(
  limit = 50,
  offset = 0
): { entries: CacheListEntry[]; total: number } {
  const entries: CacheListEntry[] = [];
  let idx = 0;
  for (const [key, value] of resultCache.entries()) {
    if (idx >= offset && entries.length < limit) {
      const parsed = parseCacheKey(key);
      entries.push({
        index: idx + 1,
        query: parsed.query,
        category: parsed.category,
        lang: parsed.lang,
        page: parsed.page,
        engines: parsed.engines,
        timeRange: parsed.timeRange,
        safeSearch: parsed.safeSearch,
        params: parsed.params,
        timestamp: value.timestamp,
        age: formatDuration(Date.now() - value.timestamp),
        resultCount: value.data?.results?.length ?? 0,
      });
    }
    idx++;
  }
  return { entries, total: resultCache.size };
}

export function showCacheList(limit = 50, offset = 0): void {
  const { entries, total } = listCacheEntries(limit, offset);

  console.log(colorize('\n╔════════════════════════════════════════════════════════════╗', 'cyan'));
  console.log(
    colorize('║              Cache Entries                                 ║', 'bold,brightGreen')
  );
  console.log(colorize('╚════════════════════════════════════════════════════════════╝', 'cyan'));
  console.log();
  console.log(colorize(`Total entries: ${total}`, 'dim'));
  console.log();

  if (entries.length === 0) {
    console.log(colorize('  No cached entries found.', 'yellow'));
    return;
  }

  entries.forEach((entry) => {
    console.log(
      colorize(`  ${String(entry.index).padStart(4)}. `, 'dim') +
        colorize(`"${truncate(entry.query, 40)}"`, 'white') +
        colorize(` [${entry.resultCount} results]`, 'cyan') +
        colorize(` (${entry.age})`, 'dim')
    );
  });

  if (total > limit) {
    console.log();
    console.log(colorize(`  ... and ${total - limit} more entries`, 'dim'));
  }
  console.log();
}

export function searchCache(searchTerm: string): CacheListEntry[] {
  const results: CacheListEntry[] = [];
  const term = searchTerm.toLowerCase();
  let idx = 0;
  for (const [key, value] of resultCache.entries()) {
    const parsed = parseCacheKey(key);
    const searchable = [
      parsed.query,
      parsed.category,
      parsed.lang,
      parsed.engines,
      parsed.timeRange,
      parsed.safeSearch,
      parsed.params,
      key,
    ]
      .join(' ')
      .toLowerCase();

    if (searchable.includes(term)) {
      results.push({
        index: idx + 1,
        key,
        query: parsed.query,
        category: parsed.category,
        lang: parsed.lang,
        page: parsed.page,
        engines: parsed.engines,
        timeRange: parsed.timeRange,
        safeSearch: parsed.safeSearch,
        params: parsed.params,
        timestamp: value.timestamp,
        age: formatDuration(Date.now() - value.timestamp),
        resultCount: value.data?.results?.length ?? 0,
      } as CacheListEntry & { key: string });
    }
    idx++;
  }
  return results;
}

export function showCacheSearch(searchTerm: string): void {
  const results = searchCache(searchTerm);

  console.log(colorize('\n╔════════════════════════════════════════════════════════════╗', 'cyan'));
  console.log(
    colorize('║              Cache Search Results                          ║', 'bold,brightGreen')
  );
  console.log(colorize('╚════════════════════════════════════════════════════════════╝', 'cyan'));
  console.log();
  console.log(colorize(`Search term: "${searchTerm}"`, 'yellow'));
  console.log(colorize(`Found: ${results.length} entries`, 'dim'));
  console.log();

  if (results.length === 0) {
    console.log(colorize('  No matching entries found.', 'yellow'));
    return;
  }

  results.forEach((entry) => {
    console.log(
      colorize(`  ${String(entry.index).padStart(4)}. `, 'dim') +
        colorize(`"${truncate(entry.query, 40)}"`, 'white') +
        colorize(` [${entry.resultCount} results]`, 'cyan') +
        colorize(` (${entry.age})`, 'dim')
    );
  });
  console.log();
}

export function getCacheEntry(index: number): (CacheEntry & { key: string }) | null {
  let idx = 0;
  for (const [key, value] of resultCache.entries()) {
    if (idx === index - 1) {
      return { key, ...value };
    }
    idx++;
  }
  return null;
}

export function inspectCacheEntry(index: number): void {
  const entry = getCacheEntry(index);

  console.log(colorize('\n╔════════════════════════════════════════════════════════════╗', 'cyan'));
  console.log(
    colorize('║              Cache Entry Details                           ║', 'bold,brightGreen')
  );
  console.log(colorize('╚════════════════════════════════════════════════════════════╝', 'cyan'));
  console.log();

  if (!entry) {
    console.log(colorize(`  Entry #${index} not found.`, 'red'));
    return;
  }

  const parsed = parseCacheKey(entry.key);
  console.log(colorize('Metadata:', 'yellow,bold'));
  console.log(`  Index: ${index}`);
  console.log(`  Query: "${parsed.query}"`);
  console.log(`  Category: ${parsed.category}`);
  console.log(`  Language: ${parsed.lang}`);
  console.log(`  Page: ${parsed.page}`);
  console.log(`  Engines: ${parsed.engines}`);
  console.log(`  Time Range: ${parsed.timeRange}`);
  console.log(`  Safe Search: ${parsed.safeSearch}`);
  console.log(`  Params: ${parsed.params}`);
  console.log(`  Cached: ${new Date(entry.timestamp).toISOString()}`);
  console.log(`  Age: ${formatDuration(Date.now() - entry.timestamp)}`);
  console.log();

  console.log(colorize('Data:', 'yellow,bold'));
  console.log(`  Results: ${entry.data?.results?.length ?? 0}`);
  console.log(`  Suggestions: ${entry.data?.suggestions?.length ?? 0}`);
  console.log(`  Answers: ${entry.data?.answers?.length ?? 0}`);
  console.log();

  if (entry.data?.results && entry.data.results.length > 0) {
    console.log(colorize('Results Preview:', 'yellow,bold'));
    entry.data.results.slice(0, 3).forEach((r, i) => {
      console.log(colorize(`  ${i + 1}. ${truncate(r.title ?? 'No title', 50)}`, 'white'));
      console.log(colorize(`     ${truncate(r.url ?? '', 60)}`, 'cyan'));
    });
    if (entry.data.results.length > 3) {
      console.log(colorize(`  ... and ${entry.data.results.length - 3} more`, 'dim'));
    }
  }
  console.log();
}

export function deleteCacheEntry(index: number): boolean {
  let idx = 0;
  let keyToDelete: string | null = null;
  for (const key of resultCache.keys()) {
    if (idx === index - 1) {
      keyToDelete = key;
      break;
    }
    idx++;
  }

  if (keyToDelete) {
    resultCache.delete(keyToDelete);
    saveCacheSync();
    return true;
  }
  return false;
}

export function exportCache(outputFile: string): ExportResult {
  try {
    const cacheObj: Record<string, CacheEntry> = {};
    for (const [key, value] of resultCache.entries()) {
      cacheObj[key] = value;
    }
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      entries: cacheObj,
      stats: {
        totalEntries: resultCache.size,
        maxSize: LRU_CACHE_SIZE,
      },
    };
    fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2));
    return { success: true, entries: resultCache.size, file: outputFile };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export function importCache(inputFile: string, merge = true): ImportResult {
  try {
    if (!fs.existsSync(inputFile)) {
      return { success: false, error: 'File not found' };
    }
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8')) as {
      entries?: Record<string, CacheEntry>;
    } & Record<string, CacheEntry>;
    const entries = data.entries ?? data;
    let imported = 0;
    let skipped = 0;

    for (const [key, value] of Object.entries(entries)) {
      if (merge && resultCache.has(key)) {
        skipped++;
        continue;
      }
      resultCache.set(key, value);
      imported++;
    }

    saveCacheSync();
    return { success: true, imported, skipped, total: Object.keys(entries).length };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export function pruneCache(maxAge: number): PruneResult {
  const maxTimestamp = Date.now() - maxAge;
  let pruned = 0;

  for (const [key, value] of resultCache.entries()) {
    if (value.timestamp < maxTimestamp) {
      resultCache.delete(key);
      pruned++;
    }
  }

  if (pruned > 0) {
    saveCacheSync();
  }

  return { pruned, remaining: resultCache.size };
}

export function showCacheHelp(): void {
  console.log(colorize('\n╔════════════════════════════════════════════════════════════╗', 'cyan'));
  console.log(
    colorize('║              Cache Management Commands                     ║', 'bold,brightGreen')
  );
  console.log(colorize('╚════════════════════════════════════════════════════════════╝', 'cyan'));
  console.log();
  console.log(colorize('USAGE:', 'yellow,bold'));
  console.log('  searxng-cli --cache                    Show cache status');
  console.log('  searxng-cli --cache-list               List all cached entries');
  console.log('  searxng-cli --cache-list <n>           List first n entries');
  console.log('  searxng-cli --cache-search <term>      Search cache by term');
  console.log('  searxng-cli --cache-inspect <n>        Show details of entry #n');
  console.log('  searxng-cli --cache-delete <n>         Delete entry #n');
  console.log('  searxng-cli --cache-clear              Clear all cache');
  console.log('  searxng-cli --cache-export <file>      Export cache to JSON file');
  console.log('  searxng-cli --cache-import <file>      Import cache from JSON file');
  console.log('  searxng-cli --cache-prune <days>       Remove entries older than n days');
  console.log();
  console.log(colorize('CACHE CONFIGURATION:', 'yellow,bold'));
  console.log(`  TTL: Endless (no expiration)`);
  console.log(`  Max Size: ${LRU_CACHE_SIZE <= 0 ? 'Unlimited' : `${LRU_CACHE_SIZE} entries`}`);
  console.log(`  Persistent: ${PERSISTENT_CACHE_ENABLED ? 'Yes' : 'No'}`);
  console.log(`  Compressed: ${CACHE_COMPRESSION ? 'Yes' : 'No'}`);
  console.log(`  Location: ${CACHE_FILE}`);
  console.log();
}
