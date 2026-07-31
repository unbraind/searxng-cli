/**
 * Typed, read-only access to stable SearXNG application resources for agent and CI workflows.
 */
import { encode as encodeToon } from '@toon-format/toon';
import { getSearxngUrl, VERSION } from '../config';
import { rateLimitedFetch } from '../http';
import { fetchInstanceCapabilities, fetchInstanceErrors } from '../storage';
import { safeJsonStringify } from '../utils';

/**
 * Stable read-only SearXNG resource exposed by the instance command and SDK facade.
 */
export type InstanceResource =
  | 'capabilities'
  | 'categories'
  | 'config'
  | 'descriptions'
  | 'engines'
  | 'errors'
  | 'health'
  | 'languages'
  | 'manifest'
  | 'metrics'
  | 'opensearch'
  | 'plugins'
  | 'robots'
  | 'source-status'
  | 'stats'
  | 'stats-page';

/**
 * Lossless machine output formats supported by every instance resource.
 */
export type InstanceResourceFormat = 'json' | 'raw' | 'toon';

/**
 * Provenance-bearing machine contract shared by JSON and TOON resource output.
 */
export interface InstanceResourceEnvelope {
  schemaVersion: '1.0';
  format: `instance-${InstanceResource}`;
  checkedAt: string;
  source: string;
  endpoint: string;
  contentType: string;
  data: unknown;
}

/**
 * Fetched resource state used to render typed envelopes or the exact raw body.
 */
export interface InstanceResourceResult {
  envelope: InstanceResourceEnvelope;
  raw: string;
  healthy: boolean;
}

/**
 * Comparison between the configured SearXNG build and the official upstream branch head.
 */
export interface SearxngSourceStatus {
  status: 'current' | 'stale' | 'unavailable';
  reason:
    | 'live_config_unavailable'
    | 'live_commit_unavailable'
    | 'upstream_rate_limited'
    | 'upstream_unavailable'
    | null;
  live: {
    version: string | null;
    commit: string | null;
  };
  upstream: {
    repository: 'searxng/searxng';
    branch: 'master';
    commit: string | null;
    commitUrl: string | null;
  };
}

const UPSTREAM_COMMIT_ENDPOINT = 'https://api.github.com/repos/searxng/searxng/commits/master';
const SOURCE_STATUS_TIMEOUT_MS = 15_000;

const HTTP_RESOURCES: Partial<
  Record<InstanceResource, { endpoint: string; accept: string; json: boolean }>
> = {
  config: { endpoint: '/config', accept: 'application/json', json: true },
  descriptions: {
    endpoint: '/engine_descriptions.json',
    accept: 'application/json',
    json: true,
  },
  health: { endpoint: '/healthz', accept: 'text/plain', json: false },
  manifest: { endpoint: '/manifest.json', accept: 'application/json', json: true },
  metrics: {
    endpoint: '/metrics',
    accept: 'application/openmetrics-text, text/plain',
    json: false,
  },
  opensearch: {
    endpoint: '/opensearch.xml',
    accept: 'application/opensearchdescription+xml, application/xml',
    json: false,
  },
  robots: { endpoint: '/robots.txt', accept: 'text/plain', json: false },
  'stats-page': { endpoint: '/stats', accept: 'text/html', json: false },
};

/**
 * Fetch one stable SearXNG resource and normalize it into a provenance-bearing envelope.
 *
 * @param resource Resource name selected by the `instance` command.
 * @returns Structured data plus the exact upstream body for `--format raw`.
 */
export async function fetchInstanceResource(
  resource: InstanceResource
): Promise<InstanceResourceResult> {
  const baseUrl = getSearxngUrl();
  const checkedAt = new Date().toISOString();
  if (resource === 'source-status') {
    const sourceStatus: SearxngSourceStatus = {
      status: 'unavailable',
      reason: 'live_config_unavailable',
      live: { version: null, commit: null },
      upstream: {
        repository: 'searxng/searxng',
        branch: 'master',
        commit: null,
        commitUrl: null,
      },
    };

    try {
      const liveResponse = await rateLimitedFetch(`${baseUrl}/config`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': `searxng-cli/${VERSION}`,
        },
        signal: AbortSignal.timeout(SOURCE_STATUS_TIMEOUT_MS),
      });
      if (!liveResponse.ok) throw new Error('live config unavailable');
      const liveBody: unknown = JSON.parse(await liveResponse.text());
      if (
        typeof liveBody === 'object' &&
        liveBody !== null &&
        'version' in liveBody &&
        typeof liveBody.version === 'string'
      ) {
        sourceStatus.live.version = liveBody.version;
        sourceStatus.live.commit =
          /\+([0-9a-f]{7,40})(?:\b|$)/i.exec(liveBody.version)?.[1]?.toLowerCase() ?? null;
      }
      sourceStatus.reason = sourceStatus.live.commit
        ? 'upstream_unavailable'
        : 'live_commit_unavailable';
    } catch {
      sourceStatus.reason = 'live_config_unavailable';
    }

    if (sourceStatus.live.commit) {
      try {
        const githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
        const upstreamResponse = await rateLimitedFetch(UPSTREAM_COMMIT_ENDPOINT, {
          headers: {
            Accept: 'application/vnd.github+json',
            ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
            'User-Agent': `searxng-cli/${VERSION}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal: AbortSignal.timeout(SOURCE_STATUS_TIMEOUT_MS),
        });
        if (!upstreamResponse.ok) {
          sourceStatus.reason =
            upstreamResponse.status === 403 &&
            upstreamResponse.headers.get('x-ratelimit-remaining') === '0'
              ? 'upstream_rate_limited'
              : 'upstream_unavailable';
          throw new Error(sourceStatus.reason);
        }
        const upstreamBody: unknown = JSON.parse(await upstreamResponse.text());
        if (
          typeof upstreamBody !== 'object' ||
          upstreamBody === null ||
          !('sha' in upstreamBody) ||
          typeof upstreamBody.sha !== 'string' ||
          !/^[0-9a-f]{40}$/i.test(upstreamBody.sha)
        ) {
          throw new Error('upstream unavailable');
        }
        sourceStatus.upstream.commit = upstreamBody.sha.toLowerCase();
        sourceStatus.upstream.commitUrl = `https://github.com/searxng/searxng/commit/${sourceStatus.upstream.commit}`;
        sourceStatus.status = sourceStatus.upstream.commit.startsWith(sourceStatus.live.commit)
          ? 'current'
          : 'stale';
        sourceStatus.reason = null;
      } catch {
        if (sourceStatus.reason !== 'upstream_rate_limited') {
          sourceStatus.reason = 'upstream_unavailable';
        }
      }
    }

    const raw = safeJsonStringify(sourceStatus, 2);
    return {
      envelope: {
        schemaVersion: '1.0',
        format: 'instance-source-status',
        checkedAt,
        source: baseUrl,
        endpoint: '/config',
        contentType: 'application/json',
        data: sourceStatus,
      },
      raw,
      healthy: sourceStatus.status === 'current',
    };
  }

  const httpResource = HTTP_RESOURCES[resource];
  let endpoint: string;
  let contentType = 'application/json';
  let data: unknown;
  let raw: string;
  let healthy = true;

  if (httpResource) {
    endpoint = httpResource.endpoint;
    const openMetricsPassword =
      resource === 'metrics' ? process.env.SEARXNG_OPEN_METRICS_PASSWORD : undefined;
    const response = await rateLimitedFetch(`${baseUrl}${endpoint}`, {
      headers: {
        Accept: httpResource.accept,
        ...(openMetricsPassword
          ? {
              Authorization: `Basic ${Buffer.from(`${process.env.SEARXNG_OPEN_METRICS_USERNAME ?? 'searxng-cli'}:${openMetricsPassword}`).toString('base64')}`,
            }
          : {}),
        'User-Agent': `searxng-cli/${VERSION}`,
      },
    });
    raw = await response.text();
    contentType = response.headers.get('content-type') ?? httpResource.accept;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${endpoint}`);
    }
    if (httpResource.json) {
      try {
        data = JSON.parse(raw) as unknown;
      } catch {
        throw new Error(`Invalid JSON response from ${endpoint}`);
      }
    } else if (resource === 'health') {
      healthy = raw.trim().toUpperCase() === 'OK';
      data = { healthy, message: raw.trim() };
    } else {
      data = { content: raw };
    }
  } else {
    const capabilities = await fetchInstanceCapabilities();
    endpoint = resource === 'errors' || resource === 'stats' ? '/stats/errors' : '/config';
    if (resource === 'errors') {
      data = await fetchInstanceErrors();
    } else if (resource === 'stats') {
      const errors = await fetchInstanceErrors();
      data = {
        capabilities,
        engineErrorCount: Object.keys(errors).length,
        errors,
      };
    } else if (resource === 'engines') {
      data = capabilities.engines;
    } else if (resource === 'categories') {
      data = capabilities.categories;
    } else if (resource === 'languages') {
      data = capabilities.languages;
    } else if (resource === 'plugins') {
      data = capabilities.plugins;
    } else {
      data = capabilities;
    }
    raw = safeJsonStringify(data, 2);
  }

  return {
    envelope: {
      schemaVersion: '1.0',
      format: `instance-${resource}`,
      checkedAt,
      source: baseUrl,
      endpoint,
      contentType,
      data,
    },
    raw,
    healthy,
  };
}

/**
 * Render a fetched instance resource in the requested lossless machine format.
 *
 * @param result Previously fetched resource and exact upstream body.
 * @param format Output format selected by the command.
 * @returns Text suitable for stdout, a file, or a pipeline.
 */
export function renderInstanceResource(
  result: InstanceResourceResult,
  format: InstanceResourceFormat
): string {
  if (format === 'raw') return result.raw;
  if (format === 'json') return safeJsonStringify(result.envelope, 2);
  return encodeToon(result.envelope);
}
