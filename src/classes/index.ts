import {
  CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_BREAKER_RESET_TIME,
  REQUEST_DEDUP_WINDOW,
} from '../config';
import type { CircuitBreakerStatus, PerformanceMetricsData } from '../types';

export class CircuitBreaker {
  private threshold: number;
  private resetTime: number;
  private failures = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private lastFailureTime = 0;

  constructor(
    threshold: number = CIRCUIT_BREAKER_THRESHOLD,
    resetTime: number = CIRCUIT_BREAKER_RESET_TIME
  ) {
    this.threshold = threshold;
    this.resetTime = resetTime;
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  canExecute(): boolean {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTime) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true;
  }

  getStatus(): CircuitBreakerStatus {
    return { state: this.state, failures: this.failures, threshold: this.threshold };
  }

  reset(): void {
    this.failures = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = 0;
  }
}

export class RequestDeduplicator<T> {
  private windowMs: number;
  private requests: Map<string, { promise: Promise<T>; timestamp: number }>;

  constructor(windowMs: number = REQUEST_DEDUP_WINDOW) {
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  private getKey(url: string, options: { headers?: Record<string, string> }): string {
    return `${url}:${JSON.stringify(options.headers ?? {})}`;
  }

  dedupe(url: string, options: { headers?: Record<string, string> }): Promise<T> | null {
    const key = this.getKey(url, options);
    const now = Date.now();

    const entry = this.requests.get(key);
    if (entry) {
      if (now - entry.timestamp < this.windowMs) {
        return entry.promise;
      }
    }
    return null;
  }

  set(url: string, options: { headers?: Record<string, string> }, promise: Promise<T>): void {
    const key = this.getKey(url, options);
    this.requests.set(key, { promise, timestamp: Date.now() });

    promise.finally(() => {
      setTimeout(() => this.requests.delete(key), this.windowMs);
    });
  }

  clear(): void {
    this.requests.clear();
  }

  get size(): number {
    return this.requests.size;
  }
}

export class PerformanceMetrics {
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalLatency: 0,
    maxLatency: 0,
    minLatency: Infinity,
  };

  recordRequest(success: boolean, latency: number, cacheHit = false): void {
    this.metrics.totalRequests++;
    if (success) this.metrics.successfulRequests++;
    else this.metrics.failedRequests++;

    if (cacheHit) this.metrics.cacheHits++;
    else this.metrics.cacheMisses++;

    this.metrics.totalLatency += latency;
    this.metrics.maxLatency = Math.max(this.metrics.maxLatency, latency);
    this.metrics.minLatency = Math.min(this.metrics.minLatency, latency);
  }

  getStats(): PerformanceMetricsData {
    const avgLatency =
      this.metrics.totalRequests > 0
        ? Math.round(this.metrics.totalLatency / this.metrics.totalRequests)
        : 0;
    const successRate =
      this.metrics.totalRequests > 0
        ? ((this.metrics.successfulRequests / this.metrics.totalRequests) * 100).toFixed(1)
        : '0';
    const cacheHitRate =
      this.metrics.cacheHits + this.metrics.cacheMisses > 0
        ? (
            (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) *
            100
          ).toFixed(1)
        : '0';

    return {
      ...this.metrics,
      minLatency: this.metrics.minLatency === Infinity ? 0 : this.metrics.minLatency,
      avgLatency,
      successRate: `${successRate}%`,
      cacheHitRate: `${cacheHitRate}%`,
    };
  }

  reset(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalLatency: 0,
      maxLatency: 0,
      minLatency: Infinity,
    };
  }
}

export class LRUCache<T> {
  private maxSize: number;
  private cache: Map<string, T>;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key: string): T | null {
    if (!this.cache.has(key)) return null;
    const value = this.cache.get(key);
    if (value === undefined) return null;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) this.cache.delete(key);
    if (this.maxSize > 0 && this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  entries(): IterableIterator<[string, T]> {
    return this.cache.entries();
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  values(): IterableIterator<T> {
    return this.cache.values();
  }
}

export class SmartDeduplicator {
  private seenHashes: Map<string, number>;

  constructor() {
    this.seenHashes = new Map();
  }

  hashResult(result: { url?: string; link?: string; title?: string }): string {
    const url = (result.url ?? result.link ?? '').toLowerCase();
    const title = (result.title ?? '').toLowerCase().substring(0, 100);
    return `${url}:${title}`;
  }

  isDuplicate(result: { url?: string; link?: string; title?: string }): boolean {
    const hash = this.hashResult(result);
    if (this.seenHashes.has(hash)) return true;
    this.seenHashes.set(hash, Date.now());
    if (this.seenHashes.size > 10000) this.cleanup();
    return false;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [hash, time] of this.seenHashes.entries()) {
      if (now - time > 60000) this.seenHashes.delete(hash);
    }
  }

  clear(): void {
    this.seenHashes.clear();
  }

  get size(): number {
    return this.seenHashes.size;
  }
}
