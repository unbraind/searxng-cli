/**
 * Complete contract coverage for typed read-only SearXNG instance resources.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decode as decodeToon } from '@toon-format/toon';
import {
  fetchInstanceResource,
  renderInstanceResource,
  type InstanceResource,
} from '../../src/instance';
import { rateLimitedFetch } from '../../src/http';
import { fetchInstanceCapabilities, fetchInstanceErrors } from '../../src/storage';

vi.mock('../../src/config', () => ({
  getSearxngUrl: () => 'http://searxng.test',
  VERSION: 'test',
}));

vi.mock('../../src/http', () => ({
  rateLimitedFetch: vi.fn(),
}));

vi.mock('../../src/storage', () => ({
  fetchInstanceCapabilities: vi.fn(),
  fetchInstanceErrors: vi.fn(),
}));

const capabilities = {
  instance: {
    name: 'SearXNG',
    version: '2026.7.24',
    engines_count: 1,
    categories_count: 1,
    api_version: '1.0',
  },
  categories: ['general'],
  languages: ['en'],
  engines: [
    {
      name: 'example',
      shortcut: 'ex',
      categories: ['general'],
      enabled: true,
      language: 'en',
      paging: true,
      safesearch: true,
      timeRangeSupport: true,
      timeout: null,
    },
  ],
  plugins: ['calculator:enabled'],
  defaults: {
    autocomplete: '',
    language: 'en',
    locale: 'en',
    theme: 'simple',
    safeSearch: 0,
  },
};

describe('instance resources', () => {
  beforeEach(() => {
    vi.stubEnv('GITHUB_TOKEN', undefined);
    vi.stubEnv('GH_TOKEN', undefined);
    vi.mocked(rateLimitedFetch).mockReset();
    vi.mocked(fetchInstanceCapabilities).mockReset();
    vi.mocked(fetchInstanceErrors).mockReset();
    vi.mocked(fetchInstanceCapabilities).mockResolvedValue(capabilities);
    vi.mocked(fetchInstanceErrors).mockResolvedValue({ example: [{ error: 'timeout' }] });
  });

  it('fetches and renders JSON-backed HTTP resources', async () => {
    vi.mocked(rateLimitedFetch).mockResolvedValue(
      new Response('{"engines":{"example":"Example"}}', {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    );

    const result = await fetchInstanceResource('descriptions');
    expect(result.envelope).toMatchObject({
      schemaVersion: '1.0',
      format: 'instance-descriptions',
      source: 'http://searxng.test',
      endpoint: '/engine_descriptions.json',
      contentType: 'application/json; charset=utf-8',
      data: { engines: { example: 'Example' } },
    });
    expect(result.healthy).toBe(true);
    expect(renderInstanceResource(result, 'raw')).toBe('{"engines":{"example":"Example"}}');
    expect(JSON.parse(renderInstanceResource(result, 'json'))).toEqual(result.envelope);
    expect(decodeToon(renderInstanceResource(result, 'toon'))).toEqual(result.envelope);
    expect(rateLimitedFetch).toHaveBeenCalledWith(
      'http://searxng.test/engine_descriptions.json',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          'User-Agent': 'searxng-cli/test',
        },
      })
    );
  });

  it('supports every stable raw HTTP resource and health state', async () => {
    const cases: [InstanceResource, string, string][] = [
      ['config', '/config', '{"version":"current"}'],
      ['manifest', '/manifest.json', '{"name":"SearXNG"}'],
      ['opensearch', '/opensearch.xml', '<OpenSearchDescription/>'],
      ['robots', '/robots.txt', 'User-agent: *'],
      ['stats-page', '/stats', '<html>stats</html>'],
    ];

    for (const [resource, endpoint, body] of cases) {
      vi.mocked(rateLimitedFetch).mockResolvedValueOnce(
        new Response(body, {
          status: 200,
          headers: {
            'content-type': body.startsWith('{')
              ? 'application/json'
              : body.startsWith('<html')
                ? 'text/html'
                : 'text/plain',
          },
        })
      );
      const result = await fetchInstanceResource(resource);
      expect(result.envelope.endpoint).toBe(endpoint);
      expect(result.raw).toBe(body);
      expect(result.envelope.data).toEqual(
        body.startsWith('{') ? JSON.parse(body) : { content: body }
      );
    }

    vi.mocked(rateLimitedFetch)
      .mockResolvedValueOnce(new Response('OK', { status: 200 }))
      .mockResolvedValueOnce(new Response('warming', { status: 200 }));
    const healthy = await fetchInstanceResource('health');
    const unhealthy = await fetchInstanceResource('health');
    expect(healthy).toMatchObject({
      healthy: true,
      envelope: { data: { healthy: true, message: 'OK' } },
    });
    expect(unhealthy).toMatchObject({
      healthy: false,
      envelope: { data: { healthy: false, message: 'warming' } },
    });
  });

  it('normalizes capabilities and every derived resource view', async () => {
    const expectedData: Partial<Record<InstanceResource, unknown>> = {
      capabilities,
      categories: capabilities.categories,
      engines: capabilities.engines,
      languages: capabilities.languages,
      plugins: capabilities.plugins,
      errors: { example: [{ error: 'timeout' }] },
    };

    for (const resource of [
      'capabilities',
      'categories',
      'engines',
      'languages',
      'plugins',
      'errors',
    ] as const) {
      const result = await fetchInstanceResource(resource);
      expect(result.envelope.data).toEqual(expectedData[resource]);
      expect(result.raw).toBe(JSON.stringify(expectedData[resource], null, 2));
    }

    const stats = await fetchInstanceResource('stats');
    expect(stats.envelope).toMatchObject({
      endpoint: '/stats/errors',
      data: {
        capabilities,
        engineErrorCount: 1,
        errors: { example: [{ error: 'timeout' }] },
      },
    });
  });

  it('reports current and stale official source comparisons', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'github-fixture');
    vi.mocked(rateLimitedFetch)
      .mockResolvedValueOnce(new Response('{"version":"2026.7.26+b060c780d"}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response('{"sha":"b060c780d0751a55e75ad22f0d930c8965789db8"}', { status: 200 })
      )
      .mockResolvedValueOnce(new Response('{"version":"2026.7.24+0909dbc9"}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response('{"sha":"b060c780d0751a55e75ad22f0d930c8965789db8"}', { status: 200 })
      );

    const current = await fetchInstanceResource('source-status');
    const stale = await fetchInstanceResource('source-status');
    expect(current).toMatchObject({
      healthy: true,
      envelope: {
        format: 'instance-source-status',
        endpoint: '/config',
        data: {
          status: 'current',
          reason: null,
          live: { version: '2026.7.26+b060c780d', commit: 'b060c780d' },
          upstream: {
            repository: 'searxng/searxng',
            branch: 'master',
            commit: 'b060c780d0751a55e75ad22f0d930c8965789db8',
          },
        },
      },
    });
    expect(stale).toMatchObject({
      healthy: false,
      envelope: {
        data: {
          status: 'stale',
          reason: null,
          live: { commit: '0909dbc9' },
        },
      },
    });
    expect(JSON.parse(renderInstanceResource(current, 'raw'))).toEqual(current.envelope.data);
    expect(rateLimitedFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/searxng/searxng/commits/master',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer github-fixture',
        }),
        signal: expect.any(AbortSignal),
      })
    );
    expect(rateLimitedFetch).toHaveBeenNthCalledWith(
      1,
      'http://searxng.test/config',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('distinguishes unavailable live, version, and upstream source evidence', async () => {
    vi.mocked(rateLimitedFetch)
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"version":"custom"}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"version":"2026.7.26+b060c780d"}', { status: 200 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"version":"2026.7.26+b060c780d"}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"sha":"invalid"}', { status: 200 }));

    const liveUnavailable = await fetchInstanceResource('source-status');
    const commitUnavailable = await fetchInstanceResource('source-status');
    const missingVersion = await fetchInstanceResource('source-status');
    const upstreamHttpUnavailable = await fetchInstanceResource('source-status');
    const upstreamPayloadUnavailable = await fetchInstanceResource('source-status');
    expect(liveUnavailable.envelope.data).toMatchObject({
      status: 'unavailable',
      reason: 'live_config_unavailable',
    });
    expect(commitUnavailable.envelope.data).toMatchObject({
      status: 'unavailable',
      reason: 'live_commit_unavailable',
      live: { version: 'custom' },
    });
    expect(missingVersion.envelope.data).toMatchObject({
      status: 'unavailable',
      reason: 'live_commit_unavailable',
      live: { version: null, commit: null },
    });
    expect(upstreamHttpUnavailable.envelope.data).toMatchObject({
      status: 'unavailable',
      reason: 'upstream_unavailable',
      live: { commit: 'b060c780d' },
    });
    expect(upstreamPayloadUnavailable.envelope.data).toMatchObject({
      status: 'unavailable',
      reason: 'upstream_unavailable',
      live: { commit: 'b060c780d' },
    });
  });

  it('uses GH_TOKEN and distinguishes an exhausted upstream rate limit', async () => {
    vi.stubEnv('GH_TOKEN', 'gh-fixture');
    vi.mocked(rateLimitedFetch)
      .mockResolvedValueOnce(new Response('{"version":"2026.7.26+b060c780d"}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response('rate limited', {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0' },
        })
      );

    const result = await fetchInstanceResource('source-status');
    expect(result.envelope.data).toMatchObject({
      status: 'unavailable',
      reason: 'upstream_rate_limited',
      live: { commit: 'b060c780d' },
    });
    expect(rateLimitedFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/searxng/searxng/commits/master',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer gh-fixture' }),
      })
    );
  });

  it('rejects failed and malformed HTTP resources', async () => {
    vi.mocked(rateLimitedFetch)
      .mockResolvedValueOnce(new Response('no', { status: 503 }))
      .mockResolvedValueOnce(new Response('{invalid', { status: 200 }));

    await expect(fetchInstanceResource('health')).rejects.toThrow('HTTP 503 from /healthz');
    await expect(fetchInstanceResource('manifest')).rejects.toThrow(
      'Invalid JSON response from /manifest.json'
    );
  });

  it('uses the declared accept type when content-type is absent', async () => {
    vi.mocked(rateLimitedFetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '<OpenSearchDescription/>',
    } as unknown as Response);

    const result = await fetchInstanceResource('opensearch');
    expect(result.envelope.contentType).toBe(
      'application/opensearchdescription+xml, application/xml'
    );
  });
});
