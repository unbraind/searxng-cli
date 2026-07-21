import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  compressData,
  decompressData,
  updateLatencyStats,
  resetHealthStats,
  resetConnectionHealth,
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
import { createTestSearchOptions as createMockOptions } from '../helpers/search-options';

describe('HTTP Module', () => {
  beforeEach(() => {
    resetConnectionHealth();
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

    it('returns input when compression is disabled or deflate fails', async () => {
      expect(await compressData('plain', false)).toBe('plain');
      expect(
        await compressData('plain', true, (_data, callback) => {
          callback(new Error('deflate failed'), Buffer.alloc(0));
        })
      ).toBe('plain');
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

    it('returns input when decompression is disabled', async () => {
      expect(await decompressData('plain', false)).toBe('plain');
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

    it('covers disabled, local baseline, degraded, and capped profiles', () => {
      expect(getAdaptiveTimeout(false, true)).toBeGreaterThan(0);
      resetHealthStats();
      expect(getAdaptiveTimeout(true, true)).toBe(5000);
      for (let index = 0; index < 4; index++) incrementFailureCount();
      updateLatencyStats(5000);
      expect(getAdaptiveTimeout(true, true)).toBe(30000);
      expect(getAdaptiveTimeout(true, false)).toBeGreaterThan(0);
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

    it('records transport failure and reuses that recent result', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('offline'));
      await expect(checkConnectionHealth()).resolves.toBe(false);
      expect(getConnectionHealth()).toMatchObject({ healthy: false, latency: 0 });
      await expect(checkConnectionHealth()).resolves.toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
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

    it('supports explicit disabled and local warmup profiles', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
      await warmupConnection(false, true);
      await warmupConnection(true, false);
      expect(fetchSpy).not.toHaveBeenCalled();
      await warmupConnection(true, true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
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

    it('merges HTTPS request headers and rate limits consecutive calls', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
      await rateLimitedFetch('https://example.com/config', { headers: { Accept: 'text/html' } });
      await rateLimitedFetch('https://example.com/config');
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://example.com/config',
        expect.objectContaining({ agent: httpsAgent })
      );
      expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ Accept: 'text/html' });
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

    it('uses adaptive defaults and preserves non-Error failures', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue({});
      const options = Object.assign(createMockOptions(), { timeout: undefined });
      await expect(
        fetchWithRetry(new URL('http://localhost:8080/search?q=test'), options, 0)
      ).rejects.toEqual({});
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

    it.each([
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
      Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }),
      new Error('network unavailable'),
      new Error('fetch failed'),
      new Error('message ECONNREFUSED'),
      new Error('request timeout'),
    ])('retries every supported transient error: %s', async (error) => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ ok: true } as Response);
      const result = await fetchWithRetry(
        new URL('http://localhost:8080/search?q=test'),
        createMockOptions({ timeout: undefined, lang: undefined, silent: true }),
        1,
        0,
        true
      );
      expect(result.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('reports visible retry progress', async () => {
      vi.spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('network failed'))
        .mockResolvedValueOnce({ ok: true } as Response);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await fetchWithRetry(
        new URL('http://localhost:8080/search?q=test'),
        createMockOptions({ silent: false, verbose: false }),
        1
      );
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Retry 1'));
    });

    it('uses the remote-instance backoff profile', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('network failed'))
        .mockResolvedValueOnce({ ok: true } as Response);
      await fetchWithRetry(
        new URL('http://localhost:8080/search?q=test'),
        createMockOptions({ silent: true }),
        1,
        0,
        false
      );
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
