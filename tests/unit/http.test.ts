import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as zlib from 'zlib';
import {
  compressData,
  decompressData,
  updateLatencyStats,
  resetHealthStats,
  incrementFailureCount,
  isHealthy,
  getAdaptiveTimeout,
  getConnectionHealth,
  httpAgent,
  httpsAgent,
  circuitBreaker,
  requestDeduplicator,
  performanceMetrics,
  getRequestCount,
  getLastRequestTime,
  destroyAgents,
  checkConnectionHealth,
  warmupConnection,
  fetchWithRetry,
  rateLimitedFetch,
} from '@/http/index';
import { CIRCUIT_BREAKER_THRESHOLD } from '@/config/index';
import type { SearchOptions } from '@/types/index';

const createMockOptions = (overrides: Partial<SearchOptions> = {}): SearchOptions => ({
  query: 'test',
  format: 'toon',
  engines: null,
  lang: null,
  page: 1,
  safeSearch: 0,
  timeRange: null,
  category: null,
  limit: 10,
  timeout: 15000,
  verbose: false,
  output: null,
  unescape: true,
  autoformat: true,
  score: false,
  interactive: false,
  noCache: true,
  retries: 0,
  open: null,
  stats: false,
  raw: false,
  filter: null,
  batch: null,
  bookmark: null,
  export: null,
  quick: false,
  summary: false,
  dedup: false,
  sort: false,
  group: null,
  config: null,
  showInfo: false,
  runTest: false,
  preset: null,
  savePreset: null,
  listPresets: false,
  compare: null,
  cluster: null,
  suggestions: false,
  pipe: false,
  stream: false,
  jsonl: false,
  rank: false,
  multiSearch: null,
  domainFilter: null,
  excludeDomain: null,
  minScore: null,
  hasImage: false,
  dateAfter: null,
  dateBefore: null,
  theme: 'default',
  compact: false,
  metadata: false,
  urlsOnly: false,
  titlesOnly: false,
  autocomplete: false,
  proxy: null,
  insecure: false,
  health: false,
  watch: false,
  silent: true,
  pretty: false,
  confirm: false,
  agent: false,
  analyze: false,
  cacheStatus: false,
  extract: null,
  sentiment: false,
  structured: false,
  ...overrides,
});

describe('HTTP Module', () => {
  beforeEach(() => {
    resetHealthStats();
    circuitBreaker.reset();
    performanceMetrics.reset();
    requestDeduplicator.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('compressData', () => {
    it('should compress string data', async () => {
      const data = 'test data to compress';
      const result = await compressData(data);
      expect(typeof result).toBe('string');
    });

    it('should return non-string data unchanged', async () => {
      const data = null as unknown as string;
      const result = await compressData(data);
      expect(result).toBe(data);
    });
  });

  describe('decompressData', () => {
    it('should decompress compressed data', async () => {
      const original = 'test data to compress';
      const compressed = await compressData(original);
      const decompressed = await decompressData(compressed);
      expect(decompressed).toBe(original);
    });

    it('should return non-string data unchanged', async () => {
      const data = null as unknown as string;
      const result = await decompressData(data);
      expect(result).toBe(data);
    });

    it('should handle invalid base64 gracefully', async () => {
      const result = await decompressData('not-valid-base64!!!');
      expect(result).toBe('not-valid-base64!!!');
    });
  });

  describe('updateLatencyStats', () => {
    it('should update total requests count', () => {
      const before = getConnectionHealth();
      updateLatencyStats(100);
      const after = getConnectionHealth();
      expect(after.totalRequests).toBe(before.totalRequests + 1);
    });

    it('should track last ten latencies', () => {
      const before = getConnectionHealth();
      const beforeCount = before.lastTenLatencies.length;
      updateLatencyStats(100);
      updateLatencyStats(200);
      const health = getConnectionHealth();
      expect(health.lastTenLatencies.length).toBe(beforeCount + 2);
      expect(health.lastTenLatencies).toContain(100);
      expect(health.lastTenLatencies).toContain(200);
    });

    it('should keep only last 10 latencies', () => {
      for (let i = 0; i < 15; i++) {
        updateLatencyStats(i * 10);
      }
      const health = getConnectionHealth();
      expect(health.lastTenLatencies.length).toBe(10);
    });

    it('should calculate average latency', () => {
      updateLatencyStats(100);
      updateLatencyStats(200);
      const health = getConnectionHealth();
      expect(health.avgLatency).toBeGreaterThanOrEqual(100);
      expect(health.avgLatency).toBeLessThanOrEqual(200);
    });
  });

  describe('resetHealthStats', () => {
    it('should reset consecutive failures', () => {
      incrementFailureCount();
      incrementFailureCount();
      resetHealthStats();
      const health = getConnectionHealth();
      expect(health.consecutiveFailures).toBe(0);
    });

    it('should reset error count', () => {
      incrementFailureCount();
      resetHealthStats();
      const health = getConnectionHealth();
      expect(health.errorCount).toBe(0);
    });
  });

  describe('incrementFailureCount', () => {
    it('should increment consecutive failures', () => {
      incrementFailureCount();
      const health = getConnectionHealth();
      expect(health.consecutiveFailures).toBe(1);
    });

    it('should increment error count', () => {
      incrementFailureCount();
      const health = getConnectionHealth();
      expect(health.errorCount).toBe(1);
    });
  });

  describe('isHealthy', () => {
    it('should return true when healthy and below threshold', () => {
      resetHealthStats();
      expect(isHealthy()).toBe(true);
    });

    it('should return false when consecutive failures exceed threshold', () => {
      for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD + 1; i++) {
        incrementFailureCount();
      }
      expect(isHealthy()).toBe(false);
    });
  });

  describe('getAdaptiveTimeout', () => {
    it('should return default timeout for remote instances', () => {
      const timeout = getAdaptiveTimeout();
      expect(timeout).toBeGreaterThan(0);
    });
  });

  describe('getConnectionHealth', () => {
    it('should return health status object', () => {
      const health = getConnectionHealth();
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('lastCheck');
      expect(health).toHaveProperty('latency');
      expect(health).toHaveProperty('errorCount');
      expect(health).toHaveProperty('totalRequests');
      expect(health).toHaveProperty('avgLatency');
      expect(health).toHaveProperty('lastTenLatencies');
      expect(health).toHaveProperty('consecutiveFailures');
    });

    it('should return a copy of health status', () => {
      const health1 = getConnectionHealth();
      const health2 = getConnectionHealth();
      expect(health1).not.toBe(health2);
      expect(health1).toEqual(health2);
    });
  });

  describe('httpAgent', () => {
    it('should be an http.Agent instance', () => {
      expect(httpAgent).toBeDefined();
      expect(httpAgent.constructor.name).toBe('Agent');
    });

    it('should have correct socket settings', () => {
      expect(httpAgent.maxSockets).toBeGreaterThan(0);
    });
  });

  describe('httpsAgent', () => {
    it('should be an https.Agent instance', () => {
      expect(httpsAgent).toBeDefined();
    });

    it('should reject unauthorized by default', () => {
      expect(httpsAgent.options.rejectUnauthorized).toBe(true);
    });
  });

  describe('circuitBreaker', () => {
    it('should be a CircuitBreaker instance', () => {
      expect(circuitBreaker).toBeDefined();
      expect(circuitBreaker.constructor.name).toBe('CircuitBreaker');
    });

    it('should track failures', () => {
      circuitBreaker.recordFailure();
      const status = circuitBreaker.getStatus();
      expect(status.failures).toBe(1);
    });

    it('should reset on success', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordSuccess();
      const status = circuitBreaker.getStatus();
      expect(status.failures).toBe(0);
    });
  });

  describe('requestDeduplicator', () => {
    it('should be a RequestDeduplicator instance', () => {
      expect(requestDeduplicator).toBeDefined();
    });

    it('should be clearable', () => {
      requestDeduplicator.clear();
      expect(requestDeduplicator.size).toBe(0);
    });
  });

  describe('performanceMetrics', () => {
    it('should be a PerformanceMetrics instance', () => {
      expect(performanceMetrics).toBeDefined();
      expect(performanceMetrics.constructor.name).toBe('PerformanceMetrics');
    });

    it('should record requests', () => {
      performanceMetrics.recordRequest(true, 100);
      const stats = performanceMetrics.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
    });
  });

  describe('getRequestCount', () => {
    it('should return a number', () => {
      const count = getRequestCount();
      expect(typeof count).toBe('number');
    });
  });

  describe('getLastRequestTime', () => {
    it('should return a number', () => {
      const time = getLastRequestTime();
      expect(typeof time).toBe('number');
    });
  });

  describe('destroyAgents', () => {
    it('should call destroy on both agents without throwing', () => {
      expect(() => destroyAgents()).not.toThrow();
    });
  });

  describe('checkConnectionHealth', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return a boolean value', async () => {
      const mockResponse = { ok: true } as Response;
      vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);
      const result = await checkConnectionHealth();
      expect(typeof result).toBe('boolean');
    });

    it('should update connection health state on check', async () => {
      const mockResponse = { ok: true } as Response;
      vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);
      await checkConnectionHealth();
      const health = getConnectionHealth();
      // lastCheck should be set to a recent timestamp
      expect(health.lastCheck).toBeGreaterThan(0);
    });
  });

  describe('warmupConnection', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should not throw even when server is unavailable', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(warmupConnection()).resolves.not.toThrow();
    });
  });

  describe('rateLimitedFetch', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should make a fetch request and return response', async () => {
      const mockResponse = { ok: true, status: 200 } as Response;
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);
      const result = await rateLimitedFetch('http://localhost:8080/config', {});
      expect(result.ok).toBe(true);
    });
  });

  describe('fetchWithRetry', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.clearAllMocks();
    });

    it('should return successful response on first try', async () => {
      const mockResponse = { ok: true, status: 200 } as Response;
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);
      const options = createMockOptions({ timeout: 5000 });
      const url = new URL('http://localhost:8080/search?q=test');
      const result = await fetchWithRetry(url, options, 0);
      expect(result.ok).toBe(true);
    });

    it('should throw when no retries left and fetch fails', async () => {
      const error = new Error('Connection failed');
      vi.spyOn(global, 'fetch').mockRejectedValue(error);
      const options = createMockOptions({ timeout: 5000, retries: 0 });
      const url = new URL('http://localhost:8080/search?q=test');
      await expect(fetchWithRetry(url, options, 0)).rejects.toThrow();
    });

    it('should retry on ECONNREFUSED and eventually succeed', async () => {
      const econnError = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
      const mockResponse = { ok: true, status: 200 } as Response;
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockRejectedValueOnce(econnError)
        .mockResolvedValueOnce(mockResponse);
      const options = createMockOptions({ timeout: 5000, retries: 1, silent: true });
      const url = new URL('http://localhost:8080/search?q=test');
      const result = await fetchWithRetry(url, options, 1);
      expect(result.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
