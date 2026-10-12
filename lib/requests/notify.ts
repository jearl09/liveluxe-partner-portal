/**
 * Partner-facing emails after an ops decision (Appendix D, §12.1). Best-effort:
 * the transition is already committed and audited before any email is attempted,
 * so a mail failure is logged and never shown to ops as a failed decision.
 */
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/domain/money";
import { DECLINE_REASON_LABELS, guestsSummary } from "@/lib/domain/requests";
import { sendEmail } from "@/lib/notifications/email";
import { CounterOffer, RequestApproved, RequestDeclined } from "@/lib/notifications/templates/request-decision";
import { log } from "@/lib/observability/logger";
import { formatDate, formatTimestamp } from "@/lib/utils";
import { getRequest, type RequestDetail } from "./load";

type Kind = "approved" | "declined" | "counter";

async function recipient(detail: RequestDetail): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("partner_users")
    .select("email, status")
    .eq("id", detail.request.created_by)
    .maybeSingle();
  return data && data.status === "active" ? data.email : null;
}

/** Send the email that matches the request's new state. Never throws. */
export async function notifyPartnerOfDecision(id: string, kind: Kind, requestId: string): Promise<void> {
  try {
    const detail = await getRequest(id);
    if (!detail) return;
    const to = await recipient(detail);
    if (!to) {
      log.info("booking.notify_skipped_no_recipient", { requestId, reference: detail.request.reference });
      return;
    }
    const r = detail.request;
    const e = env();
    const common = {
      reference: r.reference,
      propertyName: detail.listing.name,
      checkIn: formatDate(r.check_in),
      checkOut: formatDate(r.check_out),
      nights: r.nights,
      guestsSummary: guestsSummary(r.guests_adults, r.guests_children, r.guests_pets),
      requestUrl: `${e.NEXT_PUBLIC_APP_URL}/requests/${r.id}`,
      supportEmail: e.EMAIL_REPLY_TO,
    };
    const money = (c: number | null) => (c == null ? null : formatMoney(c, r.currency));

    if (kind === "approved") {
      await sendEmail({
        to,
        subject: `Approved — ${r.reference}`,
        idempotencyKey: `request_approved:${r.id}:${r.approved_at ?? ""}`,
        tags: { type: "request_approved" },
        template: RequestApproved({
          ...common,
          totalFormatted: money(r.total_cents) ?? "to be confirmed",
          nextStep: "Payment and the booking confirmation follow in the portal; you will receive another email then.",
        }),
      });
    } else if (kind === "declined") {
      await sendEmail({
        to,
        subject: `Update on your request — ${r.reference}`,
        idempotencyKey: `request_declined:${r.id}:${r.declined_at ?? ""}`,
        tags: { type: "request_declined" },
        template: RequestDeclined({
          ...common,
          reasonLabel: (r.decline_reason && DECLINE_REASON_LABELS[r.decline_reason]) || "Not available",
          note: r.decline_notes || undefined,
          searchUrl: `${e.NEXT_PUBLIC_APP_URL}/search?checkIn=${r.check_in}&checkOut=${r.check_out}&guests=${r.guests_adults + r.guests_children}`,
        }),
      });
    } else {
      const last = detail.history.find((h) => h.to === "COUNTER_OFFERED");
      const meta = (last?.metadata ?? {}) as Record<string, unknown>;
      const prev = typeof meta.previousTotalCents === "number" ? meta.previousTotalCents : null;
      await sendEmail({
        to,
        subject: `Proposal for your request — ${r.reference}`,
        idempotencyKey: `counter_offer:${r.id}:${last?.at ?? ""}`,
        tags: { type: "counter_offer" },
        template: CounterOffer({
          ...common,
          message: (typeof meta.message === "string" && meta.message) || last?.reason || "",
          previousTotalFormatted: money(prev),
          newTotalFormatted: money(r.total_cents) ?? "see portal",
          datesChanged: meta.previousCheckIn !== meta.newCheckIn || meta.previousCheckOut !== meta.newCheckOut,
          respondByLabel: r.hold_expires_at ? formatTimestamp(r.hold_expires_at) : "as soon as possible",
        }),
      });
    }
  } catch (err) {
    log.warn("booking.notify_failed", { requestId, id, kind, error: err instanceof Error ? err.message : String(err) });
  }
}
