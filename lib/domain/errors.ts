/**
 * Error code catalogue — spec §16.3.
 * Every API error is one of these; the envelope shape is fixed in lib/api/response.ts.
 */
export const ErrorCodes = {
  DATES_UNAVAILABLE: { http: 409, message: "These dates are no longer available for this property." },
  DATES_HELD: { http: 409, message: "Another partner currently holds these dates." },
  QUOTE_EXPIRED: { http: 410, message: "This quote has expired. Please re-quote." },
  PRICE_CHANGED: { http: 409, message: "The price has changed since this quote was issued." },
  PRICE_HASH_MISMATCH: { http: 400, message: "Quote integrity check failed. Please re-quote." },
  MIN_STAY_NOT_MET: { http: 422, message: "The stay is shorter than the minimum for these dates." },
  CAPACITY_EXCEEDED: { http: 422, message: "Guest or pet count exceeds this property's limits." },
  CREDIT_LIMIT_EXCEEDED: { http: 403, message: "This booking would exceed your organisation's credit limit." },
  ORG_SUSPENDED: { http: 403, message: "Your organisation's account is suspended for new bookings." },
  PAYMENT_REQUIRES_ACTION: { http: 402, message: "Additional authentication is required to complete payment." },
  PAYMENT_FAILED: { http: 402, message: "Payment could not be authorised." },
  HOSTAWAY_UNAVAILABLE: { http: 503, message: "Availability data is temporarily degraded. Writes are paused." },
  HOSTAWAY_WRITE_AMBIGUOUS: { http: 500, message: "Booking write outcome unknown; operations have been alerted." },
  INVALID_STATE_TRANSITION: { http: 409, message: "This action is no longer valid for the request's current status." },
  RATE_LIMITED: { http: 429, message: "Too many requests. Please retry shortly." },
  VALIDATION_FAILED: { http: 400, message: "Request validation failed." },
  UNAUTHENTICATED: { http: 401, message: "Authentication required." },
  FORBIDDEN: { http: 403, message: "You do not have permission to perform this action." },
  NOT_FOUND: { http: 404, message: "Resource not found." },
  INTERNAL: { http: 500, message: "An unexpected error occurred." },
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly http: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, details?: Record<string, unknown>, message?: string) {
    super(message ?? ErrorCodes[code].message);
    this.name = "DomainError";
    this.code = code;
    this.http = ErrorCodes[code].http;
    this.details = details;
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
