// ---------------------------------------------------------------------------
// Level-based logger for Cloudflare Workers.
// ---------------------------------------------------------------------------
// Wrangler doesn't have a built-in log level for Worker code (the
// `--log-level` flag is for the wrangler CLI, not the Worker).
// Cloudflare Workers Logs shows all console.* output.
//
// This module provides a simple level-based logger that respects a
// LOG_LEVEL env var. Set LOG_LEVEL=debug for verbose output, or
// LOG_LEVEL=info (default) for normal operation.
//
// Usage:
//   import { log } from './logger';
//   log.info('[subscribe] ok:', endpoint);
//   log.warn('[push] dead (404):', endpoint);
//   log.error('[fetch] error:', err);
//
// All log methods also call the corresponding console.* method, so
// output appears in Cloudflare Workers Logs in the dashboard.
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

function parseLevel(raw: string | undefined, fallback: LogLevel): LogLevel {
  if (!raw) return fallback;
  const normalized = raw.toLowerCase() as LogLevel;
  if (normalized in LEVELS) return normalized;
  return fallback;
}

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

export const log = {
  debug: (...args: unknown[]): void => {
    if (shouldLog('debug')) console.debug(...args);
  },
  info: (...args: unknown[]): void => {
    if (shouldLog('info')) console.info(...args);
  },
  warn: (...args: unknown[]): void => {
    if (shouldLog('warn')) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    if (shouldLog('error')) console.error(...args);
  },
};

/**
 * Initialize the logger from an env-like object.
 * Call this once at Worker startup (e.g., in fetch or scheduled entry).
 */
export function initLogger(env: { LOG_LEVEL?: string }): void {
  setLogLevel(parseLevel(env.LOG_LEVEL, 'info'));
}
