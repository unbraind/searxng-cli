/**
 * Capability-aware SearXNG response negotiation and normalization for JSON-enabled and HTML-only instances.
 */
import { parse } from 'node-html-parser';
import { fetchWithRetry } from '../http';
import type { SearchOptions, SearchResponse, SearchResult } from '../types';

function text(node: { textContent?: string } | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function attribute(
  node: { getAttribute(name: string): string | undefined } | null | undefined,
  name: string
): string | undefined {
  const value = node?.getAttribute(name)?.trim();
  return value ?? undefined;
}

/**
 * Convert SearXNG's stable results-page markup into the public SearchResponse contract.
 * @param html
 * @param query
 */
export function parseSearxngHtml(html: string, query: string): SearchResponse {
  const root = parse(html);
  const results: SearchResult[] = root.querySelectorAll('article.result').flatMap((article) => {
    const link = article.querySelector('h3 a') ?? article.querySelector('a.url_header');
    const url = attribute(link, 'href');
    if (!url) return [];

    const engineNames = article
      .querySelectorAll('.engines span, .engines a, .result-engines span, .result-engines a')
      .map((node) => text(node))
      .filter(Boolean);
    const thumbnail =
      attribute(article.querySelector('img.thumbnail'), 'src') ??
      attribute(article.querySelector('.result-images img'), 'src');

    return [
      {
        title: text(link) || url,
        url,
        content: text(
          article.querySelector('.content') ??
            article.querySelector('.result-content') ??
            article.querySelector('p')
        ),
        engine: engineNames[0],
        engines: engineNames.length > 0 ? engineNames : undefined,
        publishedDate:
          text(article.querySelector('time') ?? article.querySelector('.published_date')) ||
          undefined,
        thumbnail,
        img_src: thumbnail,
      },
    ];
  });

  const unresponsive_engines = root
    .querySelectorAll('#engines_msg-table tr')
    .map((row) => {
      const engine = text(row.querySelector('.engine-name'));
      const reason = text(row.querySelector('.response-error'));
      return [engine, reason].filter(Boolean).join(': ');
    })
    .filter(Boolean);

  const suggestions = root
    .querySelectorAll('#suggestions a, .suggestions a')
    .map((node) => text(node))
    .filter(Boolean);
  const corrections = root
    .querySelectorAll('#corrections a, .correction a')
    .map((node) => text(node))
    .filter(Boolean);
  const answers = root
    .querySelectorAll('.answer, .result-answer')
    .map((node) => text(node))
    .filter(Boolean);

  return {
    query,
    results,
    suggestions,
    corrections,
    answers,
    number_of_results: results.length,
    paging: root.querySelector('.pagination') !== null,
    unresponsive_engines,
    _upstreamFormat: 'html',
  };
}

function expectsJson(response: Response): boolean {
  const contentType = response.headers?.get?.('content-type')?.toLowerCase() ?? '';
  // Some embedders and test doubles omit headers; the canonical request asked
  // for JSON, so preserve the historical behavior unless HTML is explicit.
  return contentType.length === 0 || contentType.includes('json');
}

/**
 * Fetch a SearXNG response without assuming the administrator enabled JSON.
 * SearXNG deliberately returns 403 for disabled API formats, so retry the same
 * canonical request as HTML and normalize it into SearchResponse.
 * @param url
 * @param options
 * @param retries
 */
export async function fetchSearchResponse(
  url: URL,
  options: SearchOptions,
  retries = options.retries
): Promise<SearchResponse> {
  const response = await fetchWithRetry(url, options, retries);
  if (response.ok && expectsJson(response)) {
    const data = (await response.json()) as SearchResponse;
    data._upstreamFormat = 'json';
    return data;
  }

  if (response.status !== 403 && !response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const htmlUrl = new URL(url);
  htmlUrl.searchParams.delete('format');
  const htmlResponse = await fetchWithRetry(htmlUrl, options, retries);
  if (!htmlResponse.ok) {
    throw new Error(`HTTP ${htmlResponse.status}: ${htmlResponse.statusText}`);
  }
  return parseSearxngHtml(await htmlResponse.text(), options.query);
}
