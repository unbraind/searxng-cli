import { encode } from '@toon-format/toon';
import { TOON_SPEC_VERSION, VERSION, getSearxngUrl } from '../config';
import { stripHtml, unescapeHtml, escapeHtml, getDomain } from '../utils';
import type { SearchResult, SearchResponse, SearchOptions } from '../types';

function normalizeNumber(num: number): number | string | undefined {
  if (typeof num !== 'number' || !Number.isFinite(num)) return undefined;
  if (Object.is(num, -0)) return 0;
  const rounded = Math.round(num * 10) / 10;
  return rounded;
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname.length > 1 ? u.pathname.substring(0, 30) : '');
  } catch {
    return url.substring(0, 50);
  }
}

export function formatToonOutput(data: SearchResponse, options: SearchOptions): string {
  const results = data.results ?? [];
  const limit = options.limit === 0 ? results.length : Math.min(options.limit, results.length);
  const displayResults = results.slice(0, limit);
  const isCached = data._cached ?? false;
  const isCompact = options.compact || options.agent;
  const snippetLen = options.agent ? 80 : 120;

  const toonData: Record<string, any> = {
    tv: TOON_SPEC_VERSION,
    v: VERSION,
    q: options.query,
    n: displayResults.length,
    src: getSearxngUrl(),
    ts: new Date().toISOString(),
  };

  if (isCached) toonData.c = 1;
  if (data._cacheAge) toonData.ca = `${Math.round(data._cacheAge / 1000)}s`;
  if (data.timing) toonData.lat = data.timing;
  if (options.engines) toonData.e = options.engines;
  if (options.category) toonData.cat = options.category;
  if (options.timeRange) toonData.t = options.timeRange;
  if (data.number_of_results && data.number_of_results > 0) toonData.total = data.number_of_results;

  toonData.results = displayResults.map((r, idx) => {
    const title = stripHtml(unescapeHtml(r.title ?? '')).substring(0, 60);
    const url = options.agent ? shortenUrl(r.url ?? '') : (r.url ?? '');
    const engine = r.engine ?? (r.engines && r.engines[0]) ?? undefined;
    const score = typeof r.score === 'number' ? normalizeNumber(r.score) : undefined;
    const snippet = stripHtml(unescapeHtml(r.content ?? r.abstract ?? r.snippet ?? ''))
      .substring(0, snippetLen)
      .replace(/\s+/g, ' ');
    const published = r.publishedDate
      ? new Date(r.publishedDate).toISOString().split('T')[0]
      : undefined;

    const res: any = { i: idx + 1, title, url };
    if (engine) res.engine = engine;
    if (score !== undefined) res.score = score;
    if (snippet) res.snippet = snippet;
    if (published) res.published = published;
    return res;
  });

  if (data.answers && data.answers.length > 0) {
    toonData.answers = data.answers.slice(0, 3).map((x) => {
      const t = typeof x === 'string' ? x : ((x as { answer?: string }).answer ?? '');
      return stripHtml(unescapeHtml(t)).substring(0, 120);
    });
  }

  if (data.infoboxes && Array.isArray(data.infoboxes) && data.infoboxes.length > 0 && !isCompact) {
    const box = data.infoboxes[0] as Record<string, unknown>;
    if (box) {
      const ibTitle = typeof box.infobox === 'string' ? box.infobox : '';
      const ibContent = typeof box.content === 'string' ? box.content : '';
      if (ibTitle || ibContent) {
        toonData.infobox = {
          title: ibTitle.substring(0, 60),
          content: ibContent.substring(0, 120),
        };
      }
    }
  }

  if (data.suggestions && data.suggestions.length > 0 && !isCompact) {
    toonData.suggestions = data.suggestions.slice(0, 4);
  }

  if (data.corrections && data.corrections.length > 0 && !isCompact) {
    toonData.corrections = data.corrections.slice(0, 2);
  }

  if (!isCompact && displayResults.length > 0) {
    const domains: Record<string, number> = {};
    displayResults.forEach((r) => {
      const d = getDomain(r.url ?? '');
      if (d) domains[d] = (domains[d] ?? 0) + 1;
    });
    const sorted = Object.entries(domains)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (sorted.length > 0) {
      toonData.domains = sorted.reduce(
        (acc, [d, c]) => {
          acc[d] = c;
          return acc;
        },
        {} as Record<string, number>
      );
    }
  }

  if (data.unresponsive_engines && data.unresponsive_engines.length > 0 && options.verbose) {
    toonData.unresponsive_engines = data.unresponsive_engines.slice(0, 5);
  }

  return encode(toonData);
}

export function formatToonOutputFull(data: SearchResponse, options: SearchOptions): string {
  return formatToonOutput(data, { ...options, compact: false });
}

function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatXmlOutput(data: SearchResponse, options: SearchOptions): string {
  const results = data.results ?? [];
  const limit = options.limit === 0 ? results.length : Math.min(options.limit, results.length);
  const displayResults = results.slice(0, limit);
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<search schema="1.0" query="${escapeXml(options.query)}" source="${escapeXml(getSearxngUrl())}" generatedAt="${escapeXml(new Date().toISOString())}" resultCount="${results.length}" returnedCount="${displayResults.length}">`,
    '<results>',
  ];

  displayResults.forEach((r, i) => {
    const title = escapeXml(stripHtml(unescapeHtml(r.title ?? '')));
    const url = escapeXml(r.url ?? r.link ?? '');
    const text = escapeXml(stripHtml(unescapeHtml(r.content ?? r.abstract ?? r.snippet ?? '')));
    const engine = escapeXml(r.engine ?? r.engines?.[0] ?? '');
    const score = typeof r.score === 'number' ? r.score.toString() : '';
    parts.push(`  <result index="${i + 1}">`);
    parts.push(`    <title>${title}</title>`);
    parts.push(`    <url>${url}</url>`);
    parts.push(`    <engine>${engine}</engine>`);
    parts.push(`    <score>${escapeXml(score)}</score>`);
    parts.push(`    <text>${text}</text>`);
    parts.push('  </result>');
  });

  parts.push('</results>');
  parts.push('</search>');
  return parts.join('\n');
}

export function formatHtmlReportOutput(data: SearchResponse, options: SearchOptions): string {
  const results = data.results ?? [];
  const limit = options.limit === 0 ? results.length : Math.min(options.limit, results.length);
  const displayResults = results.slice(0, limit);
  const css =
    '*{margin:0;padding:0;box-sizing:border-box}body{font:14px system-ui;background:#0d1117;color:#c9d1d9;max-width:900px;margin:0 auto;padding:20px}h1{color:#58a6ff;margin:0 0 8px}.m{color:#8b949e;margin:0 0 16px}.r{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:10px;margin:8px 0}.r:hover{border-color:#58a6ff}.r a{color:#58a6ff;text-decoration:none}.u{color:#7ee787;font-size:11px;word-break:break-all;margin:4px 0 0}.s{color:#8b949e;font-size:13px;margin:4px 0 0}';

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(options.query)}</title><style>${css}</style></head><body><h1>${escapeHtml(options.query)}</h1><p class="m">${results.length} results</p>`;

  displayResults.forEach((r) => {
    html += `<div class="r"><a href="${escapeHtml(r.url ?? '')}">${escapeHtml(stripHtml(unescapeHtml(r.title ?? '')))}</a><div class="u">${escapeHtml(r.url ?? '')}</div>`;
    if (r.content)
      html += `<div class="s">${escapeHtml(stripHtml(unescapeHtml(r.content)).substring(0, 120))}</div>`;
    html += `</div>`;
  });

  return html + '</body></html>';
}

export { normalizeNumber };
