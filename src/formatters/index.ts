import {
  SEARXNG_URL,
  getSearxngUrl,
  VERSION,
  TOON_SPEC_VERSION,
  IS_LOCAL_INSTANCE,
} from '../config';
import { getConnectionHealth } from '../http';
import {
  colorize,
  truncate,
  stripHtml,
  unescapeHtml,
  escapeHtml,
  wrapText,
  highlightTerms,
  formatDate,
  getDomain,
  safeJsonStringify,
} from '../utils';
import type { SearchResult, SearchResponse, SearchOptions } from '../types';

function escapeCsvCell(value: string | number | null | undefined): string {
  const text = String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .trim();
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function escapeYamlScalar(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const normalized = value.replace(/\r?\n/g, '\\n');
  return `'${normalized.replace(/'/g, "''")}'`;
}

export function formatResult(result: SearchResult, idx: number, options: SearchOptions): string {
  const lines: string[] = [];
  let title = result.title ?? 'No title';
  if (options.unescape) title = unescapeHtml(title);
  if (options.autoformat) title = stripHtml(title);
  if (options.query && options.autoformat) {
    title = highlightTerms(title, options.query, 'brightYellow');
  }
  lines.push(colorize(`${idx + 1}. ${title}`, 'bold,brightWhite'));
  const url = result.url ?? result.link ?? '';
  lines.push(colorize(`   ${truncate(url, 80)}`, 'cyan'));
  const metaParts: string[] = [];
  if (result.engine) {
    metaParts.push(colorize(`[${result.engine}]`, 'dim'));
  } else if (result.engines && result.engines.length > 0) {
    metaParts.push(
      colorize(
        `[${result.engines.slice(0, 3).join(',')}${result.engines.length > 3 ? '...' : ''}]`,
        'dim'
      )
    );
  }
  if (options.score && result.score !== undefined) {
    const score = typeof result.score === 'number' ? result.score.toFixed(2) : result.score;
    metaParts.push(colorize(`score:${score}`, 'magenta'));
  }
  if (result.publishedDate) {
    metaParts.push(colorize(`${formatDate(result.publishedDate)}`, 'dim'));
  }
  if (metaParts.length > 0) lines.push(`   ${metaParts.join(' ')}`);
  let content = result.content ?? result.abstract ?? result.snippet ?? '';
  if (options.unescape) content = unescapeHtml(content);
  if (options.autoformat) content = stripHtml(content);
  if (options.query && options.autoformat) {
    content = highlightTerms(content, options.query, 'dim,brightWhite');
  }
  if (content) {
    const wrapped = wrapText(content, 76);
    lines.push(`   ${wrapped.replace(/\n/g, '\n   ')}`);
  }
  return lines.join('\n');
}

export function formatJsonOutput(data: SearchResponse, options: SearchOptions): string {
  const results = data.results ?? [];
  let filteredResults = [...results];
  if (options.filter) {
    const filterLower = options.filter.toLowerCase();
    filteredResults = filteredResults.filter(
      (r) =>
        (r.title && r.title.toLowerCase().includes(filterLower)) ||
        (r.content && r.content.toLowerCase().includes(filterLower)) ||
        (r.url && r.url.toLowerCase().includes(filterLower))
    );
  }

  const limit =
    options.limit === 0 ? filteredResults.length : Math.min(options.limit, filteredResults.length);
  const displayResults = filteredResults.slice(0, limit).map((result, idx) => ({
    index: idx + 1,
    title: result.title ?? '',
    url: result.url ?? result.link ?? '',
    content: result.content ?? result.abstract ?? result.snippet ?? '',
    engine: result.engine ?? result.engines?.[0] ?? null,
    score: result.score ?? null,
    publishedDate: result.publishedDate ?? null,
    thumbnail: result.thumbnail ?? result.img_src ?? null,
  }));

  const output = {
    schemaVersion: '1.0',
    query: options.query,
    format: 'json',
    source: getSearxngUrl(),
    generatedAt: new Date().toISOString(),
    resultCount: results.length,
    returnedCount: displayResults.length,
    filtered: Boolean(options.filter),
    cached: Boolean(data._cached),
    cacheAgeMs: data._cacheAge ?? null,
    timing: data.timing ?? null,
    numberOfResults: data.number_of_results ?? null,
    results: displayResults,
    answers: (data.answers ?? []).map((answer) =>
      typeof answer === 'string'
        ? { answer }
        : { answer: answer.answer ?? '', url: answer.url ?? null }
    ),
    suggestions: data.suggestions ?? [],
    corrections: data.corrections ?? [],
    unresponsiveEngines: data.unresponsive_engines ?? [],
    sourceParams: options.searxngParams ?? {},
  };

  return safeJsonStringify(output, options.compact ? 0 : 2);
}

export function formatJsonlOutput(data: SearchResponse, options: SearchOptions): string {
  const results = data.results ?? [];
  const limit = options.limit === 0 ? results.length : Math.min(options.limit, results.length);
  const displayResults = results.slice(0, limit);
  const generatedAt = new Date().toISOString();

  return displayResults
    .map((result, idx) =>
      safeJsonStringify({
        schemaVersion: '1.0',
        format: 'jsonl',
        query: options.query,
        source: getSearxngUrl(),
        generatedAt,
        index: idx + 1,
        title: result.title ?? '',
        url: result.url ?? result.link ?? '',
        content: result.content ?? result.abstract ?? result.snippet ?? '',
        engine: result.engine ?? result.engines?.[0] ?? null,
        score: result.score ?? null,
        publishedDate: result.publishedDate ?? null,
        thumbnail: result.thumbnail ?? result.img_src ?? null,
        cached: Boolean(data._cached),
        cacheAgeMs: data._cacheAge ?? null,
      })
    )
    .join('\n');
}

export function formatCsvOutput(data: SearchResponse, options: SearchOptions): string {
  const results = data.results ?? [];
  const limit = options.limit === 0 ? results.length : Math.min(options.limit, results.length);
  const displayResults = results.slice(0, limit);
  const lines: string[] = ['i,title,url,engine,score,text'];

  displayResults.forEach((result, idx) => {
    const title = escapeCsvCell(result.title);
    const url = escapeCsvCell(result.url ?? result.link ?? '');
    const engine = result.engine ?? result.engines?.[0] ?? '';
    const score = result.score ?? '';
    const text = escapeCsvCell(
      (result.content ?? result.abstract ?? result.snippet ?? '').substring(0, 220)
    );
    lines.push(
      `${idx + 1},${title},${url},${escapeCsvCell(engine)},${escapeCsvCell(score)},${text}`
    );
  });

  return lines.join('\n');
}

export function formatMarkdownOutput(data: SearchResponse, options: SearchOptions): string {
  const results = data.results ?? [];
  const limit = options.limit === 0 ? results.length : Math.min(options.limit, results.length);
  const displayResults = results.slice(0, limit);
  const lines: string[] = [`# ${options.query}`, `> ${results.length} results`, ''];

  displayResults.forEach((result, idx) => {
    const title = stripHtml(unescapeHtml(result.title ?? 'No title'));
    const url = result.url ?? '';
    lines.push(`${idx + 1}. [${title}](${url})`);
  });

  return lines.join('\n');
}

export function formatRawOutput(data: SearchResponse): string {
  return safeJsonStringify(data, 2);
}

export function formatYamlOutput(data: SearchResponse, options: SearchOptions): string {
  const results = data.results ?? [];
  const limit = options.limit === 0 ? results.length : Math.min(options.limit, results.length);
  const displayResults = results.slice(0, limit);
  const lines: string[] = [
    `schemaVersion: '1.0'`,
    `query: ${escapeYamlScalar(options.query)}`,
    `format: 'yaml'`,
    `source: ${escapeYamlScalar(getSearxngUrl())}`,
    `generatedAt: ${escapeYamlScalar(new Date().toISOString())}`,
    `resultCount: ${results.length}`,
    `returnedCount: ${displayResults.length}`,
    `cached: ${Boolean(data._cached)}`,
    `timing: ${escapeYamlScalar(data.timing ?? null)}`,
    'results:',
  ];

  displayResults.forEach((result, idx) => {
    const title = stripHtml(unescapeHtml(result.title ?? ''));
    const url = result.url ?? result.link ?? '';
    const text = stripHtml(unescapeHtml(result.content ?? result.abstract ?? result.snippet ?? ''));
    lines.push(`  - i: ${idx + 1}`);
    lines.push(`    title: ${escapeYamlScalar(title)}`);
    lines.push(`    url: ${escapeYamlScalar(url)}`);
    lines.push(`    engine: ${escapeYamlScalar(result.engine ?? result.engines?.[0] ?? null)}`);
    lines.push(`    score: ${escapeYamlScalar(result.score ?? null)}`);
    lines.push(`    text: ${escapeYamlScalar(text.substring(0, 220))}`);
  });

  lines.push('answers:');
  (data.answers ?? []).forEach((answer) => {
    if (typeof answer === 'string') {
      lines.push(`  - answer: ${escapeYamlScalar(answer)}`);
    } else {
      lines.push(`  - answer: ${escapeYamlScalar(answer.answer ?? '')}`);
      lines.push(`    url: ${escapeYamlScalar(answer.url ?? null)}`);
    }
  });

  lines.push('suggestions:');
  (data.suggestions ?? []).forEach((suggestion) => {
    lines.push(`  - ${escapeYamlScalar(suggestion)}`);
  });

  return lines.join('\n');
}

export function formatTableOutput(data: SearchResponse, options: SearchOptions): string {
  const results = data.results ?? [];
  const limit = options.limit === 0 ? results.length : Math.min(options.limit, results.length);
  const displayResults = results.slice(0, limit);
  const lines: string[] = [];
  const w = { i: 3, title: 45, eng: 12, score: 6 };
  const sep =
    '+'.repeat(3) + '+'.repeat(w.title + 2) + '+'.repeat(w.eng + 2) + '+'.repeat(w.score + 2) + '+';

  lines.push(colorize(sep, 'cyan'));
  lines.push(
    colorize(
      `| # | ${'Title'.padEnd(w.title)} | ${'Engine'.padEnd(w.eng)} | ${'Score'.padEnd(w.score)} |`,
      'cyan'
    )
  );
  lines.push(colorize(sep.replace(/\+/g, '='), 'cyan'));

  displayResults.forEach((result, idx) => {
    const title = truncate(stripHtml(unescapeHtml(result.title ?? '')), w.title - 2);
    const engine = truncate(result.engine ?? result.engines?.[0] ?? '', w.eng - 1);
    const score = result.score !== undefined ? result.score.toFixed(1) : '-';
    lines.push(
      `| ${String(idx + 1).padEnd(w.i)} | ${title.padEnd(w.title)} | ${engine.padEnd(w.eng)} | ${score.padEnd(w.score)} |`
    );
  });

  lines.push(colorize(sep, 'cyan'));
  lines.push(colorize(`${results.length} results`, 'dim'));

  return lines.join('\n');
}

export function formatTextOutput(data: SearchResponse, options: SearchOptions): string {
  const results = data.results ?? [];
  const limit = options.limit === 0 ? results.length : Math.min(options.limit, results.length);
  const displayResults = results.slice(0, limit);
  const lines: string[] = [`${options.query} (${results.length} results)`, ''];

  displayResults.forEach((result, idx) => {
    const title = stripHtml(unescapeHtml(result.title ?? ''));
    const url = result.url ?? '';
    lines.push(`${idx + 1}. ${title}`);
    lines.push(`   ${url}`);
  });

  return lines.join('\n');
}

export function formatSimpleOutput(data: SearchResponse, options: SearchOptions): string {
  const results = data.results ?? [];
  const limit = options.limit === 0 ? results.length : Math.min(options.limit, results.length);
  const displayResults = results.slice(0, limit);
  const lines: string[] = [];

  displayResults.forEach((result, idx) => {
    const title = stripHtml(unescapeHtml(result.title ?? '')).substring(0, 50);
    const url = result.url ?? '';
    lines.push(`${idx + 1}. ${title}`);
    lines.push(`   ${url}`);
  });
  return lines.join('\n');
}

export function formatQuickOutput(data: SearchResponse, options: SearchOptions): string {
  const results = data.results ?? [];
  const limit = options.limit === 0 ? results.length : Math.min(options.limit, results.length);
  const displayResults = results.slice(0, limit);
  const lines: string[] = [colorize(`${options.query} (${results.length})`, 'bold'), ''];

  displayResults.forEach((result, idx) => {
    const title = stripHtml(unescapeHtml(result.title ?? ''));
    const url = result.url ?? '';
    lines.push(colorize(`${idx + 1}. ${title}`, 'brightWhite'));
    lines.push(colorize(`   ${url}`, 'cyan'));
  });

  return lines.join('\n');
}

export function formatSummaryOutput(data: SearchResponse, options: SearchOptions): string {
  const results = data.results ?? [];
  const limit = options.limit === 0 ? results.length : Math.min(options.limit, results.length);
  const displayResults = results.slice(0, limit);
  const lines: string[] = [
    colorize(`${options.query}`, 'bold'),
    colorize(`${results.length} results`, 'dim'),
    '',
  ];

  displayResults.forEach((result, idx) => {
    const title = stripHtml(unescapeHtml(result.title ?? ''));
    const url = result.url ?? '';
    const score = result.score ? ` (${result.score.toFixed(1)})` : '';
    lines.push(
      `${colorize(String(idx + 1).padStart(2), 'dim')}. ${colorize(title, 'white')}${colorize(score, 'magenta')}`
    );
    lines.push(colorize(`    ${truncate(url, 70)}`, 'cyan'));
  });

  return lines.join('\n');
}

export function formatCitationOutput(data: SearchResponse, options: SearchOptions): string {
  const results = data.results ?? [];
  const limit = options.limit === 0 ? results.length : Math.min(options.limit, results.length);
  const displayResults = results.slice(0, limit);
  const lines: string[] = [];

  displayResults.forEach((result, idx) => {
    const title = stripHtml(unescapeHtml(result.title ?? 'No title'));
    const url = result.url ?? result.link ?? '';
    const domain = getDomain(url);
    const content = options.rawContent
      ? (result.content ?? result.abstract ?? result.snippet ?? '')
      : truncate(
          stripHtml(unescapeHtml(result.content ?? result.abstract ?? result.snippet ?? '')),
          200
        );

    lines.push(`[${idx + 1}] "${title}" (${domain})`);
    lines.push(`    URL: ${url}`);
    if (content) lines.push(`    Content: ${content.replace(/\s+/g, ' ')}`);
    lines.push('');
  });

  return lines.join('\n');
}
