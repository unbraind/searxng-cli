import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSearchResponse, parseSearxngHtml } from '@/search-response/index';
import type { SearchOptions } from '@/types/index';

const options = {
  query: 'typescript cli',
  retries: 0,
  timeout: 1000,
  lang: 'en',
  silent: true,
} as SearchOptions;

const html = `<!doctype html><html><body>
  <div id="suggestions"><a>typescript command line</a></div>
  <div id="corrections"><a>TypeScript CLI</a></div>
  <div class="answer">42</div>
  <article class="result result-default">
    <h3><a href="https://example.com/cli">TypeScript CLI Guide</a></h3>
    <p class="content">Build a typed command line application.</p>
    <div class="engines"><span>brave</span><span>wikipedia</span></div>
    <time>2026-07-21</time>
    <img class="thumbnail" src="https://example.com/image.png">
  </article>
  <table id="engines_msg-table"><tr>
    <td class="engine-name">google</td><td class="response-error">timeout</td>
  </tr></table>
  <nav class="pagination"></nav>
</body></html>`;

describe('SearXNG response negotiation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps the HTML results surface into SearchResponse', () => {
    const result = parseSearxngHtml(html, options.query);
    expect(result).toMatchObject({
      query: 'typescript cli',
      number_of_results: 1,
      paging: true,
      suggestions: ['typescript command line'],
      corrections: ['TypeScript CLI'],
      answers: ['42'],
      unresponsive_engines: ['google: timeout'],
      _upstreamFormat: 'html',
    });
    expect(result.results[0]).toMatchObject({
      title: 'TypeScript CLI Guide',
      url: 'https://example.com/cli',
      content: 'Build a typed command line application.',
      engine: 'brave',
      engines: ['brave', 'wikipedia'],
      publishedDate: '2026-07-21',
      thumbnail: 'https://example.com/image.png',
    });
  });

  it('maps fallback markup and safely skips unusable result rows', () => {
    const result = parseSearxngHtml(
      `<article class="result"><a class="url_header" href=" https://example.com/fallback "></a><div class="result-content">Fallback</div><div class="result-engines"><a>engine</a></div><span class="published_date">today</span><div class="result-images"><img src="thumb.png"></div></article><article class="result"><h3><a>Missing URL</a></h3></article>`,
      'fallback'
    );
    expect(result).toMatchObject({ paging: false, suggestions: [], corrections: [], answers: [] });
    expect(result.results).toEqual([
      expect.objectContaining({
        title: 'https://example.com/fallback',
        url: 'https://example.com/fallback',
        content: 'Fallback',
        engines: ['engine'],
        publishedDate: 'today',
        thumbnail: 'thumb.png',
      }),
    ]);
  });

  it('keeps optional result metadata absent when the markup omits it', () => {
    const result = parseSearxngHtml(
      '<article class="result"><h3><a href="https://example.com">Title</a></h3></article>',
      'minimal'
    );
    expect(result.results[0]).toMatchObject({
      content: '',
      engine: undefined,
      engines: undefined,
      publishedDate: undefined,
      thumbnail: undefined,
    });
  });

  it('uses an enabled JSON API directly', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ query: options.query, results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchSearchResponse(
      new URL('http://searx.local/search?q=typescript+cli&format=json'),
      options
    );
    expect(result._upstreamFormat).toBe('json');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accepts JSON test doubles that omit response headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ query: options.query, results: [] }),
      })
    );
    await expect(
      fetchSearchResponse(new URL('http://searx.local/search?q=test&format=json'), options)
    ).resolves.toMatchObject({ _upstreamFormat: 'json' });
  });

  it('falls back when a successful response explicitly contains HTML', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })
      )
      .mockResolvedValueOnce(new Response(html, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fetchSearchResponse(new URL('http://searx.local/search?q=test&format=json'), options)
    ).resolves.toMatchObject({ _upstreamFormat: 'html' });
  });

  it('falls back to HTML when the instance disables JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
      .mockResolvedValueOnce(
        new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
      );
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchSearchResponse(
      new URL('http://searx.local/search?q=typescript+cli&format=json'),
      options
    );
    expect(result._upstreamFormat).toBe('html');
    const fallbackUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(fallbackUrl).not.toContain('format=json');
  });

  it('reports non-format HTTP failures without a fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('failure', { status: 500 })));
    await expect(
      fetchSearchResponse(new URL('http://searx.local/search?q=test&format=json'), options)
    ).rejects.toThrow('HTTP 500');
  });

  it('reports a failed HTML fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
        .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
    );
    await expect(
      fetchSearchResponse(new URL('http://searx.local/search?q=test&format=json'), options)
    ).rejects.toThrow('HTTP 503');
  });
});
