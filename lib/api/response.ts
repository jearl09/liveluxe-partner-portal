/**
 * Uniform API conventions — spec §16.1.
 *  - JSON only; camelCase on the wire.
 *  - Every request carries X-Request-Id (generated if absent) → logs + error envelope.
 *  - Errors use one envelope shape across every endpoint.
 */
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { DomainError, isDomainError, ErrorCodes, type ErrorCode } from "@/lib/domain/errors";
import { log } from "@/lib/observability/logger";

export function requestId(req: Request): string {
  return req.headers.get("x-request-id") ?? `req_${crypto.randomUUID()}`;
}

export function ok<T>(data: T, init?: ResponseInit & { requestId?: string }) {
  const res = NextResponse.json(data, init);
  if (init?.requestId) res.headers.set("x-request-id", init.requestId);
  return res;
}

export function fail(code: ErrorCode, reqId: string, details?: Record<string, unknown>, message?: string) {
  const spec = ErrorCodes[code];
  const res = NextResponse.json(
    { error: { code, message: message ?? spec.message, details: details ?? {}, requestId: reqId } },
    { status: spec.http },
  );
  res.headers.set("x-request-id", reqId);
  if (code === "RATE_LIMITED") res.headers.set("retry-after", "10");
  return res;
}

/** Parse and validate a JSON body against a Zod schema. Field-level errors on failure. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new DomainError("VALIDATION_FAILED", { reason: "invalid_json" });
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new DomainError("VALIDATION_FAILED", { fields: flattenZod(result.error) });
  }
  return result.data;
}

function flattenZod(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_root";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

type Handler<Ctx> = (req: Request, ctx: Ctx, meta: { requestId: string }) => Promise<Response>;

/**
 * Wraps a Route Handler with request-id propagation, timing, structured logging
 * and DomainError → envelope translation. Unknown errors become INTERNAL with the
 * requestId as the support reference; the stack goes to logs (and Sentry), never to the client.
 */
export function withApi<Ctx>(route: string, handler: Handler<Ctx>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    const reqId = requestId(req);
    const started = Date.now();
    try {
      const res = await handler(req, ctx, { requestId: reqId });
      log.info("api", { requestId: reqId, route, durationMs: Date.now() - started, outcome: String(res.status) });
      return res;
    } catch (e) {
      const durationMs = Date.now() - started;
      if (isDomainError(e)) {
        log.warn("api.domain_error", { requestId: reqId, route, durationMs, outcome: e.code, details: e.details });
        return fail(e.code, reqId, e.details, e.message);
      }
      log.error("api.unhandled", {
        requestId: reqId,
        route,
        durationMs,
        error: e instanceof Error ? e.stack : String(e),
      });
      return fail("INTERNAL", reqId);
    }
  };
}
