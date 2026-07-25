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
