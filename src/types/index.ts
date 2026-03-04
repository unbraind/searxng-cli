export interface SearchResult {
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
  embeddings?: number[];
}

export interface SearXNGInfobox {
  infobox?: string;
  id?: string;
  content?: string;
  img_src?: string;
  urls?: Array<{ title: string; url: string }>;
  attributes?: Array<{ label: string; value: string }>;
  engine?: string;
  engines?: string[];
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  suggestions?: string[];
  answers?: Array<string | { answer: string; url?: string }>;
  corrections?: string[];
  infoboxes?: SearXNGInfobox[];
  number_of_results?: number;
  paging?: boolean;
  unresponsive_engines?: string[];
  timing?: string;
  _cached?: boolean;
  _cacheAge?: number;
  _semantic?: boolean;
  _similarity?: number;
}

export interface SearchOptions {
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
  citation: boolean;
  rawContent: boolean;
  exportEmbeddings: boolean;
  autoRefine: boolean;
  fetchContent: boolean;
  systemPrompt: string | null;
  validateOutput: boolean;
  strict: boolean;
  offlineFirst?: boolean;
  requestJson?: boolean;
  refreshEngines: boolean;
  instanceInfo: boolean;
  instanceInfoJson: boolean;
  searxngParams?: Record<string, string>;
  estimateTokens?: boolean;
  maxTokens?: number | null;
}

export type OutputFormat =
  | 'toon'
  | 'json'
  | 'jsonl'
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

export type SafeSearchLevel = 0 | 1 | 2;

export type TimeRange = 'day' | 'week' | 'month' | 'year';

export type ColorTheme = 'default' | 'ocean' | 'forest' | 'sunset' | 'mono';

export interface CacheEntry {
  timestamp: number;
  data: SearchResponse;
}

export interface CacheStats {
  entries: number;
  maxSize: number | 'unlimited';
  utilization: string;
  persistent: boolean;
  compressed: boolean;
  maxAge: string;
  file: string;
  fileExists: boolean;
  fileSize: string | number;
  oldestEntry: string | null;
  newestEntry: string | null;
}

export interface ConnectionHealth {
  healthy: boolean;
  lastCheck: number;
  latency: number;
  errorCount: number;
  totalRequests: number;
  avgLatency: number;
  lastTenLatencies: number[];
  consecutiveFailures: number;
}

export interface CircuitBreakerStatus {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  threshold: number;
}

export interface InstanceInfo {
  name: string;
  version: string;
  engines_count: number;
  categories_count: number;
  api_version: string;
  contact_url?: string | null;
  donation_url?: string | null;
  privacypolicy_url?: string | null;
}

export interface AppConfig {
  defaultLimit: number;
  defaultFormat: OutputFormat;
  defaultTimeout: number;
  autoUnescape: boolean;
  autoFormat: boolean;
  colorize: boolean;
  showScores: boolean;
  saveHistory: boolean;
  maxHistory: number;
  defaultEngines: string | null;
  defaultCategory: string | null;
  theme: ColorTheme;
}

export interface Settings extends AppConfig {
  searxngUrl: string;
  defaultSearxngParams: Record<string, string>;
  forceLocalRouting: boolean;
  forceLocalAgentRouting: boolean;
  lastSetupVersion: string;
  setupCompletedAt: string;
}

export interface HistoryEntry {
  query: string;
  timestamp: string;
}

export interface BookmarkEntry extends SearchResult {
  bookmarkedAt: string;
}

export interface QueryExpansion {
  query: string;
  engines: string | null;
  category: string | null;
}

export interface AdvancedFilters {
  domain: string | null;
  excludeDomain: string | null;
  minScore: string | null;
  hasImage: boolean;
  dateAfter: string | null;
  dateBefore: string | null;
}

export interface ResultMetadata {
  totalResults: number;
  uniqueDomains: number;
  domains: Array<[string, number]>;
  engines: Array<[string, number]>;
  types: {
    withImages: number;
    withDates: number;
    withScores: number;
  };
}

export interface ResultAnalysis {
  query: string;
  totalResults: number;
  domains: Record<string, number>;
  engines: Record<string, number>;
  topKeywords: Array<{ word: string; count: number }>;
  avgTitleLength: number;
  avgContentLength: number;
  withImages: number;
  withDates: number;
  withScores: number;
  sentiment: {
    positive: number;
    negative: number;
    neutral: number;
  };
  topDomains?: Array<{ domain: string; count: number }>;
  topEngines?: Array<{ engine: string; count: number }>;
}

export interface ClusterResult {
  domain?: string;
  engine?: string;
  count: number;
  results: SearchResult[];
}

export interface Suggestions {
  popular: string[];
  recent: string[];
}

export interface PerformanceMetricsData {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cacheHits: number;
  cacheMisses: number;
  totalLatency: number;
  maxLatency: number;
  minLatency: number;
  avgLatency: number;
  successRate: string;
  cacheHitRate: string;
}

export interface ExportResult {
  success: boolean;
  entries?: number;
  file?: string;
  error?: string;
}

export interface ImportResult {
  success: boolean;
  imported?: number;
  skipped?: number;
  total?: number;
  error?: string;
}

export interface PruneResult {
  pruned: number;
  remaining: number;
}

export interface ColorConfig {
  reset: string;
  bold: string;
  dim: string;
  italic: string;
  underline: string;
  blink: string;
  reverse: string;
  hidden: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
  bgBlack: string;
  bgRed: string;
  bgGreen: string;
  bgYellow: string;
  bgBlue: string;
  bgMagenta: string;
  bgCyan: string;
  bgWhite: string;
  [key: string]: string;
}

export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  error: string;
  dim: string;
}

export interface SearchAlias {
  engines?: string;
  category?: string;
  desc: string;
}
