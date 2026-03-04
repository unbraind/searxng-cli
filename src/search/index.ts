import { URL } from 'url';
import { SEARXNG_URL, getSearxngUrl, SEARCH_ALIASES } from '../config';
import { smartDeduplicator } from '../cache';
import {
  getDomain,
  escapeRegex,
  colorize,
  truncate,
  stripHtml,
  unescapeHtml,
  embedText,
  cosineSimilarity,
} from '../utils';
import type {
  SearchResult,
  SearchOptions,
  QueryExpansion,
  AdvancedFilters,
  ResultMetadata,
  ResultAnalysis,
  ClusterResult,
} from '../types';

export function buildUrl(options: SearchOptions): URL {
  const url = new URL(`${getSearxngUrl()}/search`);
  if (options.searxngParams) {
    for (const [key, value] of Object.entries(options.searxngParams)) {
      if (key.trim()) {
        url.searchParams.set(key, value);
      }
    }
  }
  url.searchParams.set('q', options.query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('pageno', options.page.toString());
  url.searchParams.set('safesearch', options.safeSearch.toString());
  if (options.engines) url.searchParams.set('engines', options.engines);
  if (options.lang) url.searchParams.set('language', options.lang);
  if (options.timeRange) url.searchParams.set('time_range', options.timeRange);
  if (options.category) url.searchParams.set('categories', options.category);
  return url;
}

export function calculateRelevanceScore(result: SearchResult, query: string): number {
  let score = 0;
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  const title = (result.title ?? '').toLowerCase();
  const content = (result.content ?? '').toLowerCase();
  const url = (result.url ?? '').toLowerCase();

  for (const term of queryTerms) {
    if (title.includes(term)) score += 10;
    if (title.startsWith(term)) score += 5;
    if (content.includes(term)) score += 3;
    if (url.includes(term)) score += 2;
  }

  if (result.score !== undefined && typeof result.score === 'number') {
    score += result.score * 5;
  }

  const trustedDomains = [
    'github.com',
    'stackoverflow.com',
    'wikipedia.org',
    'docs.',
    'edu',
    'gov',
  ];
  for (const domain of trustedDomains) {
    if (url.includes(domain)) {
      score += 5;
      break;
    }
  }

  return Math.round(score * 10) / 10;
}

export function rankResults(results: SearchResult[], query: string): SearchResult[] {
  const ranked = results.map((r) => ({
    ...r,
    relevanceScore: calculateRelevanceScore(r, query),
  }));

  return ranked.sort((a, b) => {
    const scoreA = a.relevanceScore ?? 0;
    const scoreB = b.relevanceScore ?? 0;
    return scoreB - scoreA;
  });
}

export function applyAdvancedFilters(
  results: SearchResult[],
  filters: AdvancedFilters
): SearchResult[] {
  let filtered = results;

  if (filters.domain) {
    const domains = filters.domain.split(',').map((d) => d.trim().toLowerCase());
    filtered = filtered.filter((r) => {
      try {
        const url = new URL(r.url ?? '');
        return domains.some((d) => url.hostname.includes(d));
      } catch {
        return false;
      }
    });
  }

  if (filters.excludeDomain) {
    const excludeDomains = filters.excludeDomain.split(',').map((d) => d.trim().toLowerCase());
    filtered = filtered.filter((r) => {
      try {
        const url = new URL(r.url ?? '');
        return !excludeDomains.some((d) => url.hostname.includes(d));
      } catch {
        return true;
      }
    });
  }

  if (filters.minScore) {
    const minScore = parseFloat(filters.minScore);
    filtered = filtered.filter((r) => (r.score ?? 0) >= minScore);
  }

  if (filters.hasImage) {
    filtered = filtered.filter((r) => r.thumbnail || r.img_src);
  }

  if (filters.dateAfter) {
    const afterDate = new Date(filters.dateAfter);
    filtered = filtered.filter((r) => {
      if (!r.publishedDate) return false;
      return new Date(r.publishedDate) >= afterDate;
    });
  }

  if (filters.dateBefore) {
    const beforeDate = new Date(filters.dateBefore);
    filtered = filtered.filter((r) => {
      if (!r.publishedDate) return false;
      return new Date(r.publishedDate) <= beforeDate;
    });
  }

  return filtered;
}

export function extractMetadata(results: SearchResult[]): ResultMetadata {
  const domains: Record<string, number> = {};
  const engines: Record<string, number> = {};
  const types = { withImages: 0, withDates: 0, withScores: 0 };

  for (const r of results) {
    try {
      const url = new URL(r.url ?? '');
      const domain = url.hostname.replace(/^www\./, '');
      domains[domain] = (domains[domain] ?? 0) + 1;
    } catch {
      // Ignore URL parse errors
    }

    const engine = r.engine ?? (r.engines && r.engines[0]) ?? 'unknown';
    engines[engine] = (engines[engine] ?? 0) + 1;

    if (r.thumbnail || r.img_src) types.withImages++;
    if (r.publishedDate) types.withDates++;
    if (r.score !== undefined) types.withScores++;
  }

  return {
    totalResults: results.length,
    uniqueDomains: Object.keys(domains).length,
    domains: Object.entries(domains)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) as Array<[string, number]>,
    engines: Object.entries(engines).sort((a, b) => b[1] - a[1]) as Array<[string, number]>,
    types,
  };
}

export function deduplicateResults(results: SearchResult[]): SearchResult[] {
  smartDeduplicator.clear();
  const seen = new Map<string, boolean>();
  const deduped: SearchResult[] = [];
  for (const result of results) {
    const url = result.url ?? result.link ?? '';
    const normalizedUrl = url
      .replace(/^https?:\/\/(www\.)?/, '')
      .replace(/\/$/, '')
      .toLowerCase();
    if (!seen.has(normalizedUrl) && !smartDeduplicator.isDuplicate(result)) {
      seen.set(normalizedUrl, true);
      deduped.push(result);
    }
  }
  return deduped;
}

export function sortByScore(results: SearchResult[]): SearchResult[] {
  return [...results].sort((a, b) => {
    const scoreA = typeof a.score === 'number' ? a.score : 0;
    const scoreB = typeof b.score === 'number' ? b.score : 0;
    return scoreB - scoreA;
  });
}

export function expandQuery(query: string): QueryExpansion {
  let expanded = query;
  let engines: string | null = null;
  let category: string | null = null;

  for (const [alias, config] of Object.entries(SEARCH_ALIASES)) {
    if (query.startsWith(alias + ' ') || query === alias) {
      expanded = query.replace(alias, '').trim();
      if (config.engines) engines = config.engines;
      if (config.category) category = config.category;
      break;
    }
  }

  return { query: expanded, engines, category };
}

export function clusterByDomain(results: SearchResult[]): ClusterResult[] {
  const clusters: Record<string, SearchResult[]> = {};
  for (const result of results) {
    try {
      const url = new URL(result.url ?? result.link ?? '');
      const domain = url.hostname.replace(/^www\./, '');
      if (!clusters[domain]) clusters[domain] = [];
      clusters[domain].push(result);
    } catch {
      // Ignore URL parse errors
    }
  }
  return Object.entries(clusters)
    .map(([domain, items]) => ({ domain, count: items.length, results: items }))
    .sort((a, b) => b.count - a.count);
}

export function clusterByEngine(results: SearchResult[]): ClusterResult[] {
  const clusters: Record<string, SearchResult[]> = {};
  for (const result of results) {
    const engine = result.engine ?? (result.engines && result.engines[0]) ?? 'unknown';
    if (!clusters[engine]) clusters[engine] = [];
    clusters[engine].push(result);
  }
  return Object.entries(clusters)
    .map(([engine, items]) => ({ engine, count: items.length, results: items }))
    .sort((a, b) => b.count - a.count);
}

export function analyzeResults(results: SearchResult[], query: string): ResultAnalysis {
  const keywordCounts: Record<string, number> = {};
  const analysis: ResultAnalysis = {
    query,
    totalResults: results.length,
    domains: {},
    engines: {},
    topKeywords: [],
    avgTitleLength: 0,
    avgContentLength: 0,
    withImages: 0,
    withDates: 0,
    withScores: 0,
    sentiment: { positive: 0, negative: 0, neutral: 0 },
  };
  const positiveWords = [
    'best',
    'great',
    'excellent',
    'good',
    'helpful',
    'guide',
    'tutorial',
    'solution',
  ];
  const negativeWords = ['error', 'bug', 'issue', 'problem', 'fail', 'broken', 'deprecated'];
  let totalTitleLen = 0;
  let totalContentLen = 0;
  for (const r of results) {
    const title = (r.title ?? '').toLowerCase();
    const content = (r.content ?? '').toLowerCase();
    const combined = title + ' ' + content;
    totalTitleLen += title.length;
    totalContentLen += content.length;
    try {
      const url = new URL(r.url ?? '');
      const domain = url.hostname.replace(/^www\./, '');
      analysis.domains[domain] = (analysis.domains[domain] ?? 0) + 1;
    } catch {
      // Ignore URL parse errors
    }
    const engine = r.engine ?? (r.engines && r.engines[0]) ?? 'unknown';
    analysis.engines[engine] = (analysis.engines[engine] ?? 0) + 1;
    if (r.thumbnail || r.img_src) analysis.withImages++;
    if (r.publishedDate) analysis.withDates++;
    if (r.score !== undefined) analysis.withScores++;
    const words = combined.split(/\s+/).filter((w) => w.length > 4);
    for (const word of words) {
      if (!query.toLowerCase().includes(word)) {
        keywordCounts[word] = (keywordCounts[word] ?? 0) + 1;
      }
    }
    let posCount = 0;
    let negCount = 0;
    for (const word of positiveWords) if (combined.includes(word)) posCount++;
    for (const word of negativeWords) if (combined.includes(word)) negCount++;
    if (posCount > negCount) analysis.sentiment.positive++;
    else if (negCount > posCount) analysis.sentiment.negative++;
    else analysis.sentiment.neutral++;
  }
  analysis.avgTitleLength = results.length > 0 ? Math.round(totalTitleLen / results.length) : 0;
  analysis.avgContentLength = results.length > 0 ? Math.round(totalContentLen / results.length) : 0;
  analysis.topKeywords = Object.entries(keywordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));
  analysis.topDomains = Object.entries(analysis.domains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));
  analysis.topEngines = Object.entries(analysis.engines)
    .sort((a, b) => b[1] - a[1])
    .map(([engine, count]) => ({ engine, count }));
  return analysis;
}

export function showClusteredResults(results: SearchResult[], clusterType: string): void {
  const clusters = clusterType === 'engine' ? clusterByEngine(results) : clusterByDomain(results);

  console.log(colorize(`\n╔════════════════════════════════════════════════════════════╗`, 'cyan'));
  console.log(
    colorize(
      `║              Results Clustered by ${clusterType === 'engine' ? 'Engine' : 'Domain'}`.padEnd(
        59
      ) + '║',
      'bold,brightGreen'
    )
  );
  console.log(colorize('╚════════════════════════════════════════════════════════════╝', 'cyan'));
  console.log();

  clusters.forEach((cluster, idx) => {
    const name = clusterType === 'engine' ? cluster.engine : cluster.domain;
    console.log(
      colorize(`\n${idx + 1}. ${name}`, 'yellow,bold') +
        colorize(` (${cluster.count} results)`, 'dim')
    );
    console.log(colorize('─'.repeat(50), 'dim'));
    cluster.results.slice(0, 3).forEach((r, i) => {
      const title = truncate(stripHtml(unescapeHtml(r.title ?? 'No title')), 60);
      console.log(`   ${i + 1}. ${colorize(title, 'white')}`);
      console.log(colorize(`      ${truncate(r.url ?? '', 70)}`, 'cyan'));
    });
    if (cluster.results.length > 3) {
      console.log(colorize(`   ... and ${cluster.results.length - 3} more`, 'dim'));
    }
  });

  console.log();
  console.log(colorize(`Total: ${clusters.length} clusters, ${results.length} results`, 'dim'));
}

export function generateVectorEmbeddings(results: SearchResult[]): SearchResult[] {
  return results.map((r) => {
    const textToEmbed = `${r.title ?? ''} ${r.content ?? r.snippet ?? ''}`.toLowerCase();
    return {
      ...r,
      embeddings: embedText(textToEmbed),
    };
  });
}

export function autoRefineQuery(query: string): string {
  const noQuotes = query.replace(/["']/g, '');
  const stopWords = [
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'is',
    'are',
  ];
  const terms = noQuotes.split(/\s+/).filter((w) => !stopWords.includes(w.toLowerCase()));
  if (terms.length === 0) return query; // Fallback if query was only stop words

  // Try a broader search by just taking the first few meaningful terms if there are many
  if (terms.length > 5) {
    return terms.slice(0, 5).join(' ');
  }

  // If it's a short query, append a general term to force results, or just return terms
  return terms.join(' ');
}

export async function fetchWebpageContent(results: SearchResult[]): Promise<SearchResult[]> {
  const fetchPromises = results.map(async (result) => {
    if (!result.url) return result;
    try {
      const response = await fetch(result.url, {
        signal: AbortSignal.timeout(5000), // 5 seconds timeout
        headers: { 'User-Agent': 'SearXNG-CLI/Bot' },
      });
      if (!response.ok) return result;
      const html = await response.text();
      // Extract rough text content using basic string manipulation
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      let content = bodyMatch ? bodyMatch[1] : html;
      content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      content = stripHtml(content).replace(/\s+/g, ' ').trim();

      return {
        ...result,
        content: content ? content.substring(0, 5000) : result.content, // limit to 5000 chars
      };
    } catch (e) {
      return result; // Fallback to original snippet on error
    }
  });

  return Promise.all(fetchPromises);
}
