import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import * as zlib from 'zlib';
import {
  SEARXNG_URL,
  getSearxngUrl,
  VERSION,
  IS_LOCAL_INSTANCE,
  DEFAULT_TIMEOUT,
  MAX_RETRIES,
  RETRY_DELAY,
  MAX_CONCURRENT_REQUESTS,
  MAX_KEEPALIVE_SOCKETS,
  SOCKET_TIMEOUT,
  HEALTH_CHECK_INTERVAL,
  CONNECTION_TIMEOUT,
  CIRCUIT_BREAKER_THRESHOLD,
  ENABLE_COMPRESSION,
  ENABLE_WARMUP,
  WARMUP_TIMEOUT,
  ADAPTIVE_TIMEOUT_ENABLED,
} from '../config';
import { sleep, calculateBackoff, formatDuration, colorize } from '../utils';
import { CircuitBreaker, RequestDeduplicator, PerformanceMetrics } from '../classes';
import type { ConnectionHealth, SearchOptions } from '../types';

const compressionEnabled = ENABLE_COMPRESSION && !process.env.NO_COMPRESSION;

export async function compressData(data: string): Promise<string> {
  if (!compressionEnabled || typeof data !== 'string') return data;
  return new Promise((resolve) => {
    zlib.deflate(data, (err, buffer) => {
      if (err) resolve(data);
      else resolve(buffer.toString('base64'));
    });
  });
}

export async function decompressData(data: string): Promise<string> {
  if (!compressionEnabled || typeof data !== 'string') return data;
  try {
    const buffer = Buffer.from(data, 'base64');
    return new Promise((resolve) => {
      zlib.inflate(buffer, (err, inflated) => {
        if (err) resolve(data);
        else resolve(inflated.toString('utf8'));
      });
    });
  } catch {
    return data;
  }
}

export const httpAgent = new http.Agent({
  keepAlive: false,
  maxSockets: MAX_CONCURRENT_REQUESTS,
  maxFreeSockets: MAX_KEEPALIVE_SOCKETS,
  timeout: SOCKET_TIMEOUT,
});

export const httpsAgent = new https.Agent({
  keepAlive: false,
  maxSockets: MAX_CONCURRENT_REQUESTS,
  maxFreeSockets: MAX_KEEPALIVE_SOCKETS,
  timeout: SOCKET_TIMEOUT,
  rejectUnauthorized: true,
});

let connectionHealth: ConnectionHealth = {
  healthy: true,
  lastCheck: 0,
  latency: 0,
  errorCount: 0,
  totalRequests: 0,
  avgLatency: 0,
  lastTenLatencies: [],
  consecutiveFailures: 0,
};

export function updateLatencyStats(latency: number): void {
  connectionHealth.totalRequests++;
  connectionHealth.lastTenLatencies.push(latency);
  if (connectionHealth.lastTenLatencies.length > 10) {
    connectionHealth.lastTenLatencies.shift();
  }
  const sum = connectionHealth.lastTenLatencies.reduce((a, b) => a + b, 0);
  connectionHealth.avgLatency = Math.round(sum / connectionHealth.lastTenLatencies.length);
}

export function resetHealthStats(): void {
  connectionHealth.consecutiveFailures = 0;
  connectionHealth.errorCount = 0;
}

export function incrementFailureCount(): void {
  connectionHealth.consecutiveFailures++;
  connectionHealth.errorCount++;
}

export function isHealthy(): boolean {
  return (
    connectionHealth.healthy && connectionHealth.consecutiveFailures < CIRCUIT_BREAKER_THRESHOLD
  );
}

export function getAdaptiveTimeout(): number {
  if (!ADAPTIVE_TIMEOUT_ENABLED || !IS_LOCAL_INSTANCE) return DEFAULT_TIMEOUT;
  const avgLatency = connectionHealth.avgLatency || 500;
  const multiplier = connectionHealth.consecutiveFailures > 3 ? 2 : 1;
  const baseTimeout = Math.max(avgLatency * 8, 5000);
  return Math.min(baseTimeout * multiplier, 30000);
}

export function getConnectionHealth(): ConnectionHealth {
  return { ...connectionHealth };
}

export const circuitBreaker = new CircuitBreaker();
export const requestDeduplicator = new RequestDeduplicator<Response>();
export const performanceMetrics = new PerformanceMetrics();

let lastRequestTime = 0;
let requestCount = 0;

export interface FetchOptions extends RequestInit {
  timeout?: number;
  agent?: http.Agent | https.Agent;
}

export async function rateLimitedFetch(
  url: string | URL,
  options: FetchOptions = {}
): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < 30) {
    await sleep(30 - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();
  requestCount++;

  const parsedUrl = new URL(url.toString());
  const agent = parsedUrl.protocol === 'https:' ? httpsAgent : httpAgent;

  const headers: Record<string, string> = {
    'User-Agent': `searxng-cli/${VERSION}`,
    Accept: 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    ...(options.headers as Record<string, string>),
  };

  const fetchOptions: RequestInit & { agent?: http.Agent | https.Agent } = {
    ...options,
    agent,
    headers,
  };
  return fetch(url.toString(), fetchOptions);
}

export async function checkConnectionHealth(): Promise<boolean> {
  const now = Date.now();
  if (now - connectionHealth.lastCheck < HEALTH_CHECK_INTERVAL) {
    return connectionHealth.healthy;
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);
    const response = await rateLimitedFetch(`${getSearxngUrl()}/config`, {
      signal: controller.signal,
      headers: { 'User-Agent': `searxng-cli/${VERSION}` },
    });
    clearTimeout(timeoutId);

    const latency = Date.now() - start;
    connectionHealth.healthy = response.ok;
    connectionHealth.latency = latency;
    connectionHealth.lastCheck = now;
    connectionHealth.errorCount = 0;
    updateLatencyStats(latency);
    return response.ok;
  } catch {
    connectionHealth.healthy = false;
    connectionHealth.latency = 0;
    connectionHealth.lastCheck = now;
    connectionHealth.errorCount++;
    return false;
  }
}

export async function warmupConnection(): Promise<void> {
  if (!ENABLE_WARMUP || !IS_LOCAL_INSTANCE) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WARMUP_TIMEOUT);
    const endpoints = ['/config', '/search?q=warmup&format=json'];
    const baseUrl = getSearxngUrl();
    await Promise.allSettled(
      endpoints.map((ep) =>
        rateLimitedFetch(`${baseUrl}${ep}`, {
          signal: controller.signal,
          agent: httpAgent,
          headers: { 'User-Agent': `searxng-cli/${VERSION}` },
        }).catch(() => {
          // Ignore warmup errors
        })
      )
    );
    clearTimeout(timeoutId);
  } catch {
    // Ignore warmup errors
  }
}

export async function fetchWithRetry(
  url: URL,
  options: SearchOptions,
  retries = MAX_RETRIES,
  attempt = 0
): Promise<Response> {
  const adaptiveTimeout = getAdaptiveTimeout();
  const requestedTimeout = options.timeout || DEFAULT_TIMEOUT;
  const effectiveTimeout = options.timeout
    ? Math.max(requestedTimeout, adaptiveTimeout)
    : adaptiveTimeout;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
  const startTime = Date.now();
  try {
    const response = await rateLimitedFetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': `searxng-cli/${VERSION}`,
        'Accept-Language': options.lang ?? 'en-US,en;q=0.9',
        Connection: 'keep-alive',
        'X-Request-ID': `cli-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      },
    });
    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;
    updateLatencyStats(latency);
    resetHealthStats();
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    circuitBreaker.recordFailure();
    incrementFailureCount();
    const error = err as Error & { code?: string };
    const errMsg = error.message ?? '';
    const errName = error.name ?? '';
    const shouldRetry =
      retries > 0 &&
      (errName === 'AbortError' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        errMsg.includes('network') ||
        errMsg.includes('fetch') ||
        errMsg.includes('ECONNREFUSED') ||
        errMsg.includes('timeout'));
    if (shouldRetry) {
      const baseDelay = IS_LOCAL_INSTANCE ? RETRY_DELAY / 5 : RETRY_DELAY;
      const backoffDelay = calculateBackoff(attempt, baseDelay);
      if (options.verbose || !options.silent) {
        console.error(
          colorize(
            `\n  ⚠ Retry ${attempt + 1}/${MAX_RETRIES} after ${formatDuration(backoffDelay)}: ${error.message}`,
            'yellow'
          )
        );
      }
      await sleep(backoffDelay);
      return fetchWithRetry(url, options, retries - 1, attempt + 1);
    }
    throw error;
  }
}

export function destroyAgents(): void {
  httpAgent.destroy();
  httpsAgent.destroy();
}

export function getRequestCount(): number {
  return requestCount;
}

export function getLastRequestTime(): number {
  return lastRequestTime;
}
