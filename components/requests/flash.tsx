import { CheckCircle2, AlertTriangle } from "lucide-react";
import { ErrorCodes, type ErrorCode } from "@/lib/domain/errors";

const DONE: Record<string, string> = {
  "1": "Your request has been submitted. Live Luxe will review it and reply within the decision window.",
  review: "Review started. This request is now assigned to you.",
  approved: "Approved. The dates are now reserved for this partner.",
  declined: "Declined. The partner has been notified and the hold released.",
  countered: "Counter-offer sent. The SLA clock is paused until the partner answers.",
  counter_accepted: "You accepted the counter-offer. Live Luxe will confirm shortly.",
  counter_declined: "You declined the counter-offer. The request is closed and the dates released.",
};

const EXTRA: Partial<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: "Please check the highlighted fields.",
  PRICE_CHANGED: "The price moved since you saw it. Review the new total and submit again.",
  DATES_HELD: "Another partner placed a hold on these dates seconds ago. Try different dates.",
  HOSTAWAY_UNAVAILABLE: "Live availability could not be checked. Try again in a minute; nothing was changed.",
};

/** One-line outcome banner driven by ?submitted= / ?done= / ?error= query params. */
export function Flash({
  done,
  error,
  detail,
  refCode,
}: {
  done?: string;
  error?: string;
  detail?: string;
  refCode?: string;
}) {
  if (done && DONE[done]) {
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {DONE[done]}
      </p>
    );
  }
  if (error) {
    const code = (error in ErrorCodes ? error : "INTERNAL") as ErrorCode;
    return (
      <p
        role="alert"
        className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          {ErrorCodes[code].message} {EXTRA[code] ?? ""}
          {detail && <span className="block text-xs opacity-80">{detail}</span>}
          {refCode && <span className="block font-mono text-xs opacity-80">Ref {refCode}</span>}
        </span>
      </p>
    );
  }
  return null;
}
