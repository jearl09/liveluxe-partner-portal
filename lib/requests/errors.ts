/**
 * The booking SQL functions raise `CODE` or `CODE:detail` (see the migration header).
 * Translate those back into DomainErrors so the API envelope and the pages can
 * react to them like any other domain failure.
 */
import { DomainError, ErrorCodes, type ErrorCode } from "@/lib/domain/errors";

export function rpcErrorToDomain(error: { message: string; code?: string }): Error {
  const m = /^([A-Z_]+)(?::(.*))?$/.exec(error.message.trim());
  if (m && m[1] in ErrorCodes) {
    const code = m[1] as ErrorCode;
    return new DomainError(code, m[2] ? { detail: m[2] } : undefined);
  }
  return new Error(`booking rpc failed: ${error.message}`);
}
