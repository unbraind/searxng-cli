# API Reference

SearXNG CLI can be used programmatically as a Node.js module.

## Installation

```bash
npm install searxng-cli
```

## Basic Usage

```typescript
import { performSearch, SearchOptions } from 'searxng-cli';

const options: SearchOptions = {
  query: 'nodejs tutorial',
  format: 'toon',
  limit: 10,
  // ... other options
};

const results = await performSearch(options);
console.log(results);
```

## Core Functions

### performSearch

Execute a search query.

```typescript
import { performSearch } from 'searxng-cli';

const response = await performSearch({
  query: 'search query',
  format: 'json',
  limit: 10,
  engines: 'google,bing',
  page: 1,
  safeSearch: 0,
  timeRange: null,
  category: null,
  timeout: 15000,
  noCache: false,
  verbose: false,
  silent: false,
  retries: 2,
  // ... all SearchOptions fields required
});
```

## Types

### SearchOptions

```typescript
interface SearchOptions {
  query: string;
  format: OutputFormat;
  engines: string | null;
  lang: string | null;
  page: number;
  safeSearch: SafeSearchLevel;
  timeRange: TimeRange | null;
  category: string | null;
  limit: number;
  timeout: number;
  verbose: boolean;
  output: string | null;
  unescape: boolean;
  autoformat: boolean;
  score: boolean;
  interactive: boolean;
  noCache: boolean;
  retries: number;
  open: number | null;
  stats: boolean;
  raw: boolean;
  filter: string | null;
  batch: string | null;
  bookmark: string | null;
  export: string | null;
  quick: boolean;
  summary: boolean;
  dedup: boolean;
  sort: boolean;
  group: string | null;
  config: string | null;
  showInfo: boolean;
  runTest: boolean;
  preset: string | null;
  savePreset: string | null;
  listPresets: boolean;
  compare: string | null;
  cluster: string | null;
  suggestions: boolean;
  pipe: boolean;
  stream: boolean;
  jsonl: boolean;
  rank: boolean;
  multiSearch: string | null;
  domainFilter: string | null;
  excludeDomain: string | null;
  minScore: string | null;
  hasImage: boolean;
  dateAfter: string | null;
  dateBefore: string | null;
  theme: ColorTheme;
  compact: boolean;
  metadata: boolean;
  urlsOnly: boolean;
  titlesOnly: boolean;
  autocomplete: boolean;
  proxy: string | null;
  insecure: boolean;
  health: boolean;
  watch: boolean;
  silent: boolean;
  pretty: boolean;
  confirm: boolean;
  agent: boolean;
  analyze: boolean;
  cacheStatus: boolean;
  extract: string | null;
  sentiment: boolean;
  structured: boolean;
  rawContent: boolean;
  exportEmbeddings: boolean;
  autoRefine: boolean;
  fetchContent: boolean;
  systemPrompt: string | null;
  searxngParams?: Record<string, string>;
}
```

### SearchResponse

```typescript
interface SearchResponse {
  query: string;
  results: SearchResult[];
  suggestions?: string[];
  answers?: Array<string | { answer: string; url?: string }>;
  corrections?: string[];
  infoboxes?: unknown[];
  number_of_results?: number;
  paging?: boolean;
  unresponsive_engines?: string[];
  timing?: string;
  _cached?: boolean;
  _cacheAge?: number;
}
```

### SearchResult

```typescript
interface SearchResult {
  title: string;
  url: string;
  link?: string;
  content?: string;
  abstract?: string;
  snippet?: string;
  engine?: string;
  engines?: string[];
  score?: number;
  publishedDate?: string;
  thumbnail?: string;
  img_src?: string;
  parsed_url?: [string, string, string, string];
}
```

### OutputFormat

```typescript
type OutputFormat =
  | 'toon'
  | 'json'
  | 'html'
  | 'csv'
  | 'markdown'
  | 'md'
  | 'raw'
  | 'yaml'
  | 'yml'
  | 'table'
  | 'html-report'
  | 'xml'
  | 'text'
  | 'simple';
```

### SafeSearchLevel

```typescript
type SafeSearchLevel = 0 | 1 | 2;
```

### TimeRange

```typescript
type TimeRange = 'day' | 'week' | 'month' | 'year';
```

### ColorTheme

```typescript
type ColorTheme = 'default' | 'ocean' | 'forest' | 'sunset' | 'mono';
```

## Cache Functions

```typescript
import {
  getCachedResult,
  setCachedResult,
  getCacheStats,
  clearCache,
  exportCache,
  importCache,
  pruneCache,
} from 'searxng-cli/cache';

const cached = getCachedResult('query', options);
setCachedResult('query', options, data);
const stats = getCacheStats();
clearCache();
exportCache('backup.json');
importCache('backup.json');
pruneCache(7 * 24 * 60 * 60 * 1000); // 7 days
```

`stats.maxSize` is `number | 'unlimited'` (`'unlimited'` when `LRU_CACHE_SIZE=0`).

## Search Functions

```typescript
import {
  buildUrl,
  expandQuery,
  deduplicateResults,
  sortByScore,
  rankResults,
  applyAdvancedFilters,
} from 'searxng-cli/search';

const url = buildUrl(options);
const expanded = expandQuery('!gh nodejs');
const deduped = deduplicateResults(results);
const sorted = sortByScore(results);
const ranked = rankResults(results, 'query');
const filtered = applyAdvancedFilters(results, filters);
```

## Formatter Functions

```typescript
import {
  formatJsonOutput,
  formatCsvOutput,
  formatMarkdownOutput,
  formatYamlOutput,
  formatTableOutput,
} from 'searxng-cli/formatters';

import {
  formatToonOutput,
  formatXmlOutput,
  formatHtmlReportOutput,
} from 'searxng-cli/formatters-advanced';

const toon = formatToonOutput(response, options);
const json = formatJsonOutput(response, options);
const csv = formatCsvOutput(response, options);
```

## HTTP Functions

```typescript
import {
  fetchWithRetry,
  rateLimitedFetch,
  checkConnectionHealth,
  getConnectionHealth,
} from 'searxng-cli/http';

const response = await fetchWithRetry(url, options, 2);
const health = await checkConnectionHealth();
const healthStatus = getConnectionHealth();
```

## Error Handling

```typescript
try {
  const results = await performSearch(options);
  if (!results) {
    console.log('No results found');
  }
} catch (error) {
  console.error('Search failed:', error.message);
}
```

## Configuration

```typescript
import {
  SEARXNG_URL,
  getSearxngUrl,
  setSearxngUrl,
  VERSION,
  DEFAULT_TIMEOUT,
  MAX_RETRIES,
} from 'searxng-cli/config';

import { loadConfig, saveConfig, loadSettings, saveSettings } from 'searxng-cli/storage';

const config = loadConfig();
config.defaultLimit = 20;
saveConfig(config);

const settings = loadSettings();
console.log(settings.searxngUrl);
settings.defaultFormat = 'json';
saveSettings(settings);

const currentUrl = getSearxngUrl();
```
