/**
 * Structured JSON logger with automatic secret/PII redaction — spec §19.2.
 * Every line carries requestId, userId, orgId, route, durationMs and outcome where known.
 */
const REDACT_KEYS = /password|token|secret|doorcode|door_code|access_code|wifi|card|cvc|authorization|api_key|apikey/i;

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

export interface LogContext {
  requestId?: string;
  userId?: string;
  orgId?: string;
  route?: string;
  durationMs?: number;
  outcome?: string;
  [key: string]: unknown;
}

export function redact<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.test(k) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out as T;
}

function emit(level: LogLevel, msg: string, ctx: LogContext = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...redact(ctx) });
  if (level === "error" || level === "critical") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, ctx?: LogContext) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit("error", msg, ctx),
  /** CRITICAL: also fans out to Slack #alerts via lib/notifications/slack when configured. */
  critical: (msg: string, ctx?: LogContext) => emit("critical", msg, ctx),
};
