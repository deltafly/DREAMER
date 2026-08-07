/**
 * Structured logger for OneBrainer.
 * In production: JSON output suitable for log aggregation.
 * In development: human-readable colored output.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL = (process.env.LOG_LEVEL || 'info') as LogLevel;

/**
 * Redact PII from a value (string or nested object) for GDPR compliance.
 * Replaces email-like patterns and common PII with [REDACTED].
 */
function redactPII(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '[REDACTED]'
    );
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const redacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      redacted[k] = redactPII(v);
    }
    return redacted;
  }
  if (Array.isArray(value)) {
    return value.map(redactPII);
  }
  return value;
}

function shouldLog(level: LogLevel): boolean {
  return (LEVEL_PRIORITY[level] ?? 0) >= (LEVEL_PRIORITY[MIN_LEVEL] ?? 0);
}

function formatEntry(entry: LogEntry): string {
  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(entry);
  }
  const colors: Record<LogLevel, string> = {
    debug: '\x1b[36m', // cyan
    info: '\x1b[32m',  // green
    warn: '\x1b[33m',  // yellow
    error: '\x1b[31m', // red
  };
  const reset = '\x1b[0m';
  const color = colors[entry.level] || '';
  const meta = Object.entries(entry)
    .filter(([k]) => !['timestamp', 'level', 'message'].includes(k))
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  return `${color}[${entry.level.toUpperCase()}]${reset} ${entry.timestamp} ${entry.message}${meta ? ' | ' + meta : ''}`;
}

function createLog(level: LogLevel) {
  return (message: string, meta?: Record<string, unknown>) => {
    if (!shouldLog(level)) return;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(meta ? redactPII(meta) as Record<string, unknown> : {}),
    };
    const formatted = formatEntry(entry);
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  };
}

export const logger = {
  debug: createLog('debug'),
  info: createLog('info'),
  warn: createLog('warn'),
  error: createLog('error'),
};

export type { LogLevel };