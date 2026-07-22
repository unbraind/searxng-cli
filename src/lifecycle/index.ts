/**
 * Process lifecycle and persistent-cache coordination for CLI and embedded invocations.
 */
import { loadCacheSync, saveCacheSync } from '../cache';
import { colorize } from '../utils';

let isShuttingDown = false;
let cacheLoaded = false;
let exitHandlersSetup = false;

/** Load persistent cache state at most once per invocation. */
export function ensureCacheLoaded(): number {
  if (!cacheLoaded) {
    const count = loadCacheSync();
    cacheLoaded = true;
    if (process.env.DEBUG) console.error(`Cache loaded: ${count} entries`);
    return count;
  }
  return 0;
}

/** Reset cache load state for isolated tests and embedded invocations. */
export function resetCacheLoaded(): void {
  cacheLoaded = false;
}

/** Persist cache state once during a normal process shutdown. */
export function handleGracefulExit(): void {
  if (!isShuttingDown) {
    isShuttingDown = true;
    saveCacheSync();
  }
}

/** Persist cache state and terminate cleanly after an interrupt signal. */
export function handleInterrupt(): void {
  if (!isShuttingDown) {
    handleGracefulExit();
    console.log(colorize('\n\nInterrupted by user.', 'yellow'));
    process.exit(0);
  }
}

/** Persist cache state and terminate cleanly after a termination signal. */
export function handleTermination(): void {
  if (!isShuttingDown) {
    handleGracefulExit();
    console.log(colorize('\n\nTerminated.', 'yellow'));
    process.exit(0);
  }
}

/**
 * Report an unhandled asynchronous failure and terminate unsuccessfully.
 * @param reason Rejection value reported by Node.js.
 */
export function handleUnhandledRejection(reason: unknown): void {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(colorize(`Unhandled error: ${message}`, 'red'));
  process.exit(1);
}

/** Reset shutdown state for isolated tests and embedded invocations. */
export function resetShutdownState(): void {
  isShuttingDown = false;
}

/** Register process handlers exactly once. */
export function setupExitHandlers(): void {
  if (exitHandlersSetup) return;
  exitHandlersSetup = true;
  process.on('beforeExit', handleGracefulExit);
  process.on('exit', handleGracefulExit);
  process.on('SIGINT', handleInterrupt);
  process.on('SIGTERM', handleTermination);
  process.on('unhandledRejection', handleUnhandledRejection);
}
