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
  | 'opensearch'
  | 'plugins'
  | 'robots'
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
  const httpResource = HTTP_RESOURCES[resource];
  let endpoint: string;
  let contentType = 'application/json';
  let data: unknown;
  let raw: string;
  let healthy = true;

  if (httpResource) {
    endpoint = httpResource.endpoint;
    const response = await rateLimitedFetch(`${baseUrl}${endpoint}`, {
      headers: {
        Accept: httpResource.accept,
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
