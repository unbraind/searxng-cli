import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CircuitBreaker,
  RequestDeduplicator,
  PerformanceMetrics,
  LRUCache,
  SmartDeduplicator,
} from '@/classes/index';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker(3, 1000);
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const defaultBreaker = new CircuitBreaker();
      const status = defaultBreaker.getStatus();
      expect(status.state).toBe('CLOSED');
      expect(status.failures).toBe(0);
    });

    it('should accept custom threshold and reset time', () => {
      const customBreaker = new CircuitBreaker(5, 2000);
      const status = customBreaker.getStatus();
      expect(status.threshold).toBe(5);
    });
  });

  describe('recordFailure', () => {
    it('should increment failure count', () => {
      breaker.recordFailure();
      expect(breaker.getStatus().failures).toBe(1);
    });

    it('should open circuit after threshold failures', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getStatus().state).toBe('OPEN');
    });
  });

  describe('recordSuccess', () => {
    it('should reset failures and close circuit', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess();
      expect(breaker.getStatus().failures).toBe(0);
      expect(breaker.getStatus().state).toBe('CLOSED');
    });
  });

  describe('canExecute', () => {
    it('should return true when closed', () => {
      expect(breaker.canExecute()).toBe(true);
    });

    it('should return false when open', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.canExecute()).toBe(false);
    });

    it('should transition to half-open after reset time', async () => {
      const fastBreaker = new CircuitBreaker(1, 50);
      fastBreaker.recordFailure();
      expect(fastBreaker.canExecute()).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(fastBreaker.canExecute()).toBe(true);
      expect(fastBreaker.getStatus().state).toBe('HALF_OPEN');
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.reset();
      const status = breaker.getStatus();
      expect(status.state).toBe('CLOSED');
      expect(status.failures).toBe(0);
    });
  });
});

describe('RequestDeduplicator', () => {
  let deduplicator: RequestDeduplicator<string>;

  beforeEach(() => {
    deduplicator = new RequestDeduplicator(100);
  });

  describe('dedupe', () => {
    it('should return null for new requests', () => {
      const result = deduplicator.dedupe('http://example.com', {});
      expect(result).toBeNull();
    });

    it('should return existing promise for duplicate requests', async () => {
      const promise = new Promise<string>((resolve) => setTimeout(() => resolve('result'), 50));
      deduplicator.set('http://example.com', {}, promise);
      const result = deduplicator.dedupe('http://example.com', {});
      expect(result).toBe(promise);
    });
  });

  describe('clear', () => {
    it('should clear all requests', () => {
      const promise = Promise.resolve('result');
      deduplicator.set('http://example.com', {}, promise);
      deduplicator.clear();
      expect(deduplicator.size).toBe(0);
    });
  });
});

describe('PerformanceMetrics', () => {
  let metrics: PerformanceMetrics;

  beforeEach(() => {
    metrics = new PerformanceMetrics();
  });

  describe('recordRequest', () => {
    it('should record successful requests', () => {
      metrics.recordRequest(true, 100);
      const stats = metrics.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
    });

    it('should record failed requests', () => {
      metrics.recordRequest(false, 100);
      const stats = metrics.getStats();
      expect(stats.failedRequests).toBe(1);
    });

    it('should track cache hits', () => {
      metrics.recordRequest(true, 100, true);
      const stats = metrics.getStats();
      expect(stats.cacheHits).toBe(1);
    });

    it('should track latency', () => {
      metrics.recordRequest(true, 100);
      metrics.recordRequest(true, 200);
      const stats = metrics.getStats();
      expect(stats.avgLatency).toBe(150);
      expect(stats.maxLatency).toBe(200);
      expect(stats.minLatency).toBe(100);
    });
  });

  describe('getStats', () => {
    it('should calculate success rate', () => {
      metrics.recordRequest(true, 100);
      metrics.recordRequest(true, 100);
      metrics.recordRequest(false, 100);
      const stats = metrics.getStats();
      expect(stats.successRate).toBe('66.7%');
    });

    it('should calculate cache hit rate', () => {
      metrics.recordRequest(true, 100, true);
      metrics.recordRequest(true, 100, false);
      const stats = metrics.getStats();
      expect(stats.cacheHitRate).toBe('50.0%');
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      metrics.recordRequest(true, 100);
      metrics.reset();
      const stats = metrics.getStats();
      expect(stats.totalRequests).toBe(0);
    });
  });
});

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>(3);
  });

  describe('get and set', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for missing keys', () => {
      expect(cache.get('missing')).toBeNull();
    });

    it('should evict oldest entry when full', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key4')).toBe('value4');
    });

    it('should move accessed items to end', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.get('key1');
      cache.set('key4', 'value4');
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for missing keys', () => {
      expect(cache.has('missing')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete entries', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeNull();
    });

    it('should return false for missing keys', () => {
      expect(cache.delete('missing')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('size', () => {
    it('should return number of entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);
    });
  });

  describe('iterators', () => {
    it('should iterate over entries, keys, and values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const entries = Array.from(cache.entries());
      expect(entries).toEqual([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ]);

      const keys = Array.from(cache.keys());
      expect(keys).toEqual(['key1', 'key2']);

      const values = Array.from(cache.values());
      expect(values).toEqual(['value1', 'value2']);
    });
  });
});

describe('SmartDeduplicator', () => {
  let deduplicator: SmartDeduplicator;

  beforeEach(() => {
    deduplicator = new SmartDeduplicator();
  });

  describe('isDuplicate', () => {
    it('should return false for new results', () => {
      expect(deduplicator.isDuplicate({ url: 'http://example.com/1', title: 'Test' })).toBe(false);
    });

    it('should return true for duplicate results', () => {
      const result = { url: 'http://example.com/1', title: 'Test' };
      deduplicator.isDuplicate(result);
      expect(deduplicator.isDuplicate(result)).toBe(true);
    });

    it('should identify duplicates by URL and title', () => {
      deduplicator.isDuplicate({ url: 'http://example.com/1', title: 'Test' });
      expect(deduplicator.isDuplicate({ url: 'http://example.com/1', title: 'Test' })).toBe(true);
    });

    it('should trigger cleanup when over 10000 items', () => {
      vi.spyOn(deduplicator, 'cleanup');
      for (let i = 0; i < 10001; i++) {
        deduplicator.isDuplicate({ url: `http://example.com/${i}`, title: 'Test' });
      }
      expect(deduplicator.cleanup).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should remove items older than 60000ms', () => {
      deduplicator.isDuplicate({ url: 'http://example.com/old', title: 'Old' });

      const realDateNow = Date.now.bind(global.Date);
      global.Date.now = vi.fn(() => realDateNow() + 60001);

      deduplicator.cleanup();
      expect(deduplicator.size).toBe(0);

      global.Date.now = realDateNow;
    });
  });

  describe('clear', () => {
    it('should clear all seen hashes', () => {
      deduplicator.isDuplicate({ url: 'http://example.com/1', title: 'Test' });
      deduplicator.clear();
      expect(deduplicator.size).toBe(0);
    });
  });
});
