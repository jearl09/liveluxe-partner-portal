import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDot, Clock, MinusCircle, type LucideIcon } from "lucide-react";
import { Banner } from "@/components/ui/banner";
import { CopyButton } from "@/components/ui/copy-button";
import { HelpTip } from "@/components/ui/help-tip";
import { Pill } from "@/components/ui/pill";
import { SlaBadge } from "@/components/ui/sla-badge";
import { StatusPill } from "@/components/ui/status-pill";
import { StepTracker } from "@/components/ui/step-tracker";
import { PaymentPanel } from "@/components/payments/payment-panel";
import { CheckinPanel } from "@/components/requests/checkin-panel";
import { Flash } from "@/components/requests/flash";
import { QuoteLines } from "@/components/requests/quote-lines";
import { StatusTimeline, type Milestone } from "@/components/requests/status-timeline";
import { StayCard } from "@/components/requests/stay-card";
import { formatMoney } from "@/lib/domain/money";
import { nextStep, type NextStepTone } from "@/lib/domain/next-step";
import { PAYMENT_TERMS_LABELS } from "@/lib/domain/payments";
import { requestProgress } from "@/lib/domain/progress";
import { DECLINE_REASON_LABELS, guestsSummary } from "@/lib/domain/requests";
import { formatDuration, nounFor } from "@/lib/domain/status";
import type { RequestScreen } from "@/lib/requests/screen";
import { cn, formatClock, formatDate, formatTimestamp, formatWhen } from "@/lib/utils";
import { ActionPanel, buildActions } from "./request-actions";

const TONE_ICON: Record<NextStepTone, { Icon: LucideIcon; cls: string }> = {
  info: { Icon: Clock, cls: "text-info-fg" },
  attention: { Icon: CircleDot, cls: "text-attention-fg" },
  success: { Icon: CheckCircle2, cls: "text-success-fg" },
  muted: { Icon: MinusCircle, cls: "text-muted-fg" },
  danger: { Icon: AlertTriangle, cls: "text-danger-fg" },
};

const MODE_CHIP: Record<string, string> = {
  card_authorise: "Card hold",
  deposit: "Deposit",
  invoice: "Invoice",
};

function Ref({ label, value }: { label: string; value: string }) {
  return (
    <span className="border-subtle bg-surface rounded-pill text-body-sm inline-flex items-center gap-1 border py-0.5 pr-0.5 pl-2.5">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary font-mono uppercase">{value}</span>
      <CopyButton value={value} label={`${label.toLowerCase()} ${value}`} className="h-7 w-7" />
    </span>
  );
}

function Section({
  id,
  title,
  children,
  actions,
}: {
  id: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="bg-surface border-subtle rounded-card print-keep border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id}>{title}</h2>
        {actions}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-text-muted text-body-sm">{label}</dt>
      <dd className="text-text-primary text-right">{children}</dd>
    </div>
  );
}

/**
 * The request detail screen (brief §8), one component for both sides. Order on the page:
 * what is happening and what's next (header, next-step sentence, step tracker) → the
 * action panel → the record (quote, money, check-in, guest, timeline). Below 1024 px it
 * is one column and the primary action also sits in a bar at the bottom of the screen.
 */
export function RequestDetail({
  s,
  flash,
  supportEmail,
}: {
  s: RequestScreen;
  flash: { done?: string; error?: string; detail?: string; ref?: string };
  supportEmail: string;
}) {
  const { d, audience } = s;
  const r = d.request;
  const ops = audience === "ops";
  const now = new Date();
  const money = (c: number) => formatMoney(c, r.currency);

  const step = nextStep({
    audience,
    status: r.status,
    now,
    mode: s.mode,
    decisionDueAt: r.decision_due_at,
    holdExpiresAt: r.hold_expires_at,
    slaPaused: !!r.sla_paused_at,
    checkIn: r.check_in,
    checkOut: r.check_out,
    checkinFrom: formatClock(s.checkin.address?.checkinFrom ?? null),
    checkoutBy: formatClock(s.checkin.address?.checkoutBy ?? null),
    checkinReleaseAt: r.status === "CONFIRMED" ? s.checkin.timing.releaseDueAt.toISOString() : null,
    checkinReleasedAt: r.checkin_released_at,
    balanceDueAt: r.balance_due_at,
    balancePaidAt: r.balance_paid_at,
    declineReason: r.decline_reason
      ? `${DECLINE_REASON_LABELS[r.decline_reason] ?? "Other"}${r.decline_notes ? ` — ${r.decline_notes}` : ""}`
      : null,
    cancelledAt: r.cancelled_at,
    refundCents: r.cancel_refund_cents,
    cardNeeded: s.mode !== "invoice" && !s.gate.ok,
    when: (iso) => formatWhen(iso, now),
    date: formatDate,
    money,
    duration: formatDuration,
  });
  const progress = requestProgress({
    status: r.status,
    checkinReleased: !!r.checkin_released_at,
    reachedBeforeEnd: s.reachedBeforeEnd,
  });
  const actions = buildActions({
    audience,
    r,
    orgName: d.org?.name ?? null,
    createdByName: d.createdByName,
    mode: s.mode,
    payState: s.pay.state,
    invoice: s.pay.invoice,
    gate: s.gate,
    cancelQuote: s.cancel.quote,
    cutoffDays: s.cancel.policy.cutoffDays,
    modifications: s.modifications,
    canReleaseNow: s.checkin.canReleaseNow,
    counter: s.counter ? { newTotalCents: s.counter.newTotalCents, message: s.counter.message } : null,
    can: s.can,
    today: s.today,
  });

  // One banner at most (brief §4.8), the most serious condition wins.
  const banner: ReactNode = ops ? (
    r.cancelled_upstream ? (
      <Banner tone="error">
        <p className="font-medium">
          The reservation was cancelled in Hostaway
          {r.cancelled_upstream_at && ` ${formatTimestamp(r.cancelled_upstream_at)}`}
        </p>
        <p>
          It is still {r.status.toLowerCase().replace("_", " ")} here. Call the partner, then cancel with the refund
          finance decides.
        </p>
      </Banner>
    ) : r.refunds_frozen_at ? (
      <Banner tone="warn">
        Dispute open — automated refunds frozen since {formatTimestamp(r.refunds_frozen_at)}. The freeze lifts when
        Stripe closes the dispute.
      </Banner>
    ) : r.cancellation_requested_at && r.status !== "CANCELLED" ? (
      <Banner tone="warn">
        The partner asked to cancel {formatTimestamp(r.cancellation_requested_at)}
        {r.cancellation_reason && ` — ${r.cancellation_reason}`}. It is inside the cut-off, so decide with Cancel
        booking; the policy amount is shown there.
      </Banner>
    ) : r.finance_approval_required && ["SUBMITTED", "UNDER_REVIEW"].includes(r.status) ? (
      <Banner tone="warn">
        Needs finance approval: {r.finance_approval_reason ?? "routed by the credit settings"}. Only Live Luxe finance
        or an administrator can approve it.
      </Banner>
    ) : null
  ) : null;

  // What still lies ahead, for the end of the timeline.
  const upcoming: Milestone[] = [];
  if (["SUBMITTED", "UNDER_REVIEW"].includes(r.status) && r.decision_due_at)
    upcoming.push({ label: "Live Luxe decides", when: `By ${formatWhen(r.decision_due_at, now)}` });
  if (r.status === "CONFIRMED" && !r.checkin_released_at)
    upcoming.push({
      label: "Check-in details sent",
      when: formatWhen(s.checkin.timing.releaseDueAt.toISOString(), now),
    });
  if (r.balance_due_at && !r.balance_paid_at && ["CONFIRMED", "APPROVED"].includes(r.status))
    upcoming.push({ label: "Balance invoice due", when: formatDate(r.balance_due_at.slice(0, 10)) });
  if (["APPROVED", "AWAITING_PAYMENT", "CONFIRMED"].includes(r.status))
    upcoming.push({
      label: "Check-in",
      when: `${formatDate(r.check_in)}${s.checkin.address?.checkinFrom ? ` from ${formatClock(s.checkin.address.checkinFrom)}` : ""}`,
    });
  if (["APPROVED", "AWAITING_PAYMENT", "CONFIRMED", "CHECKED_IN"].includes(r.status))
    upcoming.push({
      label: "Check-out",
      when: `${formatDate(r.check_out)}${s.checkin.address?.checkoutBy ? ` by ${formatClock(s.checkin.address.checkoutBy)}` : ""}`,
    });

  const holdLeft = r.hold_expires_at ? new Date(r.hold_expires_at).getTime() - now.getTime() : null;
  const live = ["SUBMITTED", "UNDER_REVIEW", "COUNTER_OFFERED", "AWAITING_PAYMENT"].includes(r.status);
  const amountLine = s.pay.row?.amount_captured_cents
    ? `${money(s.pay.row.amount_captured_cents)} charged`
    : s.pay.row?.amount_authorised_cents
      ? `${money(s.pay.row.amount_authorised_cents)} held`
      : s.pay.invoice
        ? `${money(s.pay.invoice.amount_due_cents ?? r.total_cents ?? 0)} invoiced`
        : null;

  return (
    <div className="space-y-6 print:space-y-4">
      <Link
        href={ops ? "/admin/queue" : "/requests"}
        className="text-text-secondary hover:text-text-primary text-body-sm inline-flex h-10 items-center gap-1 print:hidden"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> {ops ? "Request queue" : "All requests"}
      </Link>

      <p className="print-only text-text-muted text-body-sm hidden border-b pb-3">
        Live Luxe · {ops ? "Operations record" : "Partner booking record"} · {d.listing.name} · printed{" "}
        {formatTimestamp(now.toISOString())}
      </p>

      {/* Header (brief §8.2) */}
      <header className="space-y-3">
        <div>
          <p className="eyebrow mb-1">
            {nounFor(r.status) === "booking" ? "Booking" : "Request"}
            {ops && d.org ? ` · ${d.org.name}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1 font-mono tracking-tight uppercase">{r.reference}</h1>
            <CopyButton value={r.reference} label={`reference ${r.reference}`} />
          </div>
          <p className="text-text-secondary mt-1">
            {d.listing.name}
            {d.listing.suburb && ` · ${d.listing.suburb}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={r.status} />
          {ops && (
            <SlaBadge
              status={r.status}
              submittedAt={r.submitted_at}
              decisionDueAt={r.decision_due_at}
              pausedAt={r.sla_paused_at}
              now={now}
            />
          )}
          <Pill
            tone="neutral"
            title={s.terms ? PAYMENT_TERMS_LABELS[s.terms as keyof typeof PAYMENT_TERMS_LABELS] : undefined}
          >
            {MODE_CHIP[s.mode]}
            {s.terms === "net14" ? " · net 14" : s.terms === "net30" ? " · net 30" : ""}
          </Pill>
          {r.claim_ref && <Ref label="Claim" value={r.claim_ref} />}
          {r.po_number && <Ref label="PO" value={r.po_number} />}
          {r.on_behalf_of && <Pill tone="info">via Live Luxe</Pill>}
        </div>
      </header>

      <div className="print:hidden">
        <Flash toast done={flash.done} error={flash.error} detail={flash.detail} refCode={flash.ref} />
      </div>
      {banner}

      {/* What's happening and what comes next */}
      <section aria-labelledby="next-heading" className="bg-surface border-subtle rounded-card border p-5">
        <div className="flex items-start gap-3">
          {(() => {
            const { Icon, cls } = TONE_ICON[step.tone];
            return <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", cls)} aria-hidden />;
          })()}
          <div>
            <h2 id="next-heading" className="text-h3 font-sans font-semibold">
              {step.title}
            </h2>
            <p className="text-text-secondary mt-1">{step.body}</p>
          </div>
        </div>
        <StepTracker model={progress} className="mt-5" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start print:grid-cols-1">
        <div className="space-y-6 lg:order-1">
          {s.counter && (
            <Section id="counter-heading" title={ops ? "Counter-offer sent" : "Live Luxe's proposal"}>
              {s.counter.message && <p className="text-text-secondary">“{s.counter.message}”</p>}
              <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-text-muted text-body-sm">Dates</dt>
                  <dd className="text-text-primary">
                    {formatDate(r.check_in)} → {formatDate(r.check_out)}
                    {s.counter.previousCheckIn &&
                      (s.counter.previousCheckIn !== r.check_in || s.counter.previousCheckOut !== r.check_out) && (
                        <span className="text-text-muted text-body-sm block">
                          was {formatDate(s.counter.previousCheckIn)} →{" "}
                          {formatDate(s.counter.previousCheckOut ?? r.check_out)}
                        </span>
                      )}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted text-body-sm">Total</dt>
                  <dd className="text-text-primary tabular-nums">
                    {money(s.counter.newTotalCents ?? r.total_cents ?? 0)}
                    {s.counter.previousTotalCents != null &&
                      s.counter.previousTotalCents !== s.counter.newTotalCents && (
                        <span className="text-text-muted text-body-sm block">
                          was {money(s.counter.previousTotalCents)}
                        </span>
                      )}
                  </dd>
                </div>
              </dl>
            </Section>
          )}

          {s.d.quote && (
            <Section
              id="quote-heading"
              title={nounFor(r.status) === "booking" ? "Price" : "Quote"}
              actions={
                live && s.d.quote.expiresAt ? (
                  <span className="text-text-muted text-body-sm">
                    Price held until {formatWhen(s.d.quote.expiresAt, now)}
                  </span>
                ) : null
              }
            >
              <QuoteLines
                lines={s.d.quote.lines}
                totalCents={s.d.quote.totalCents}
                depositCents={s.d.quote.depositCents}
                currency={s.d.quote.currency}
                nights={r.nights}
              />
            </Section>
          )}

          {!["DRAFT", "DECLINED", "EXPIRED", "COUNTER_OFFERED"].includes(r.status) && (
            <PaymentPanel
              audience={audience}
              status={r.status}
              mode={s.mode}
              state={s.pay.state}
              payment={s.pay.row}
              invoice={s.pay.invoice}
              refunds={s.pay.refunds}
              totalCents={r.total_cents}
              currency={r.currency}
            />
          )}

          <CheckinPanel
            audience={audience}
            view={s.checkin}
            accessLog={ops ? s.accessLog : undefined}
            supportEmail={supportEmail}
          />

          <Section id="stay-heading" title="Property and guest">
            <StayCard
              plain
              listing={{
                name: d.listing.name,
                suburb: d.listing.suburb,
                state: d.listing.state,
                imageUrl: d.listing.imageUrl,
              }}
              checkIn={r.check_in}
              checkOut={r.check_out}
              nights={r.nights}
              adults={r.guests_adults}
              childGuests={r.guests_children}
              pets={r.guests_pets}
            />
            <dl className="divide-subtle border-subtle mt-4 divide-y border-t">
              <Fact label="Guest">
                {r.guest_name ?? "—"}
                {(r.guest_email || r.guest_phone) && (
                  <span className="text-text-muted text-body-sm block">
                    {[r.guest_email, r.guest_phone].filter(Boolean).join(" · ")}
                  </span>
                )}
              </Fact>
              <Fact label="Household">{guestsSummary(r.guests_adults, r.guests_children, r.guests_pets)}</Fact>
              {r.cost_centre && <Fact label="Cost centre">{r.cost_centre}</Fact>}
              {r.notes && (
                <Fact label={ops ? "Partner notes" : "Your notes"}>
                  <span className="block text-left whitespace-pre-line">{r.notes}</span>
                </Fact>
              )}
            </dl>
          </Section>

          {s.modifications.length > 0 && (
            <Section id="changes-heading" title="Changes to the stay">
              <ul className="divide-subtle divide-y">
                {s.modifications.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <span>
                      <span className="text-text-primary">
                        {m.kind === "extension"
                          ? "Extension"
                          : m.kind === "early_departure"
                            ? "Early departure"
                            : "Guest change"}{" "}
                        to {formatDate(m.new_check_out)}
                      </span>
                      <span className="text-text-muted text-body-sm block">
                        Asked {formatTimestamp(m.requested_at)}
                        {m.delta_cents !== 0 &&
                          ` · ${m.delta_cents > 0 ? "extra" : "refund"} ${money(Math.abs(m.delta_cents))}`}
                        {m.decision_note && ` · “${m.decision_note}”`}
                      </span>
                    </span>
                    <Pill
                      tone={
                        m.status === "approved"
                          ? "success"
                          : m.status === "requested"
                            ? "attention"
                            : m.status === "failed"
                              ? "danger"
                              : "muted"
                      }
                    >
                      {m.status === "requested"
                        ? "Waiting for Live Luxe"
                        : m.status[0].toUpperCase() + m.status.slice(1)}
                    </Pill>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section id="timeline-heading" title="Timeline">
            <StatusTimeline history={d.history} showInternal={ops} upcoming={upcoming} />
          </Section>
        </div>

        <aside className="order-first space-y-6 lg:sticky lg:top-24 lg:order-2 print:hidden">
          <ActionPanel set={actions} audience={audience} />
          <section aria-labelledby="facts-heading" className="bg-surface border-subtle rounded-card border p-5">
            <h2 id="facts-heading">Key facts</h2>
            <dl className="divide-subtle mt-2 divide-y">
              <Fact label="Stay">
                {formatDate(r.check_in)} →<br />
                {formatDate(r.check_out)}
                <span className="text-text-muted text-body-sm block">{r.nights} nights</span>
              </Fact>
              <Fact label="Total">
                <span className="tabular-nums">{r.total_cents != null ? money(r.total_cents) : "—"}</span>
                {amountLine && <span className="text-text-muted text-body-sm block">{amountLine}</span>}
              </Fact>
              {live && r.decision_due_at && ["SUBMITTED", "UNDER_REVIEW"].includes(r.status) && (
                <Fact label="Decision due">{formatWhen(r.decision_due_at, now)}</Fact>
              )}
              {live && holdLeft !== null && holdLeft > 0 && (
                <Fact label="Dates held">
                  <span className="inline-flex items-center gap-1">
                    {formatDuration(holdLeft)} more
                    {!ops && (
                      <HelpTip label="What is a hold?">
                        While Live Luxe decides, nobody else can book these dates. If there is no decision or payment in
                        time, the hold ends and the dates are released.
                      </HelpTip>
                    )}
                  </span>
                </Fact>
              )}
              <Fact label="Requested by">
                {d.createdByName ?? "—"}
                {r.submitted_at && (
                  <span className="text-text-muted text-body-sm block">{formatTimestamp(r.submitted_at)}</span>
                )}
              </Fact>
              {ops && d.assignedToName && <Fact label="Assigned to">{d.assignedToName}</Fact>}
              {ops && (
                <Fact label="Hostaway">
                  <span className="text-body-sm font-mono">
                    listing {d.listing.hostawayListingId}
                    {r.hostaway_reservation_id ? ` · res ${r.hostaway_reservation_id}` : ""}
                  </span>
                  {!r.hostaway_reservation_id && r.hostaway_write_attempts > 0 && (
                    <span className="text-danger-fg text-body-sm block">
                      {r.hostaway_write_attempts} write attempt{r.hostaway_write_attempts === 1 ? "" : "s"}
                      {r.hostaway_last_error && ` · ${r.hostaway_last_error}`}
                    </span>
                  )}
                </Fact>
              )}
            </dl>
          </section>
        </aside>
      </div>

      {/* Phones and tablets: the one primary action within thumb reach (brief §5.10, §8.1). */}
      {actions.primary && (
        <>
          <div aria-hidden className="h-20 lg:hidden" />
          <div
            className={cn(
              "bg-surface border-subtle fixed inset-x-0 z-30 border-t px-4 py-3 lg:hidden print:hidden",
              ops ? "bottom-0" : "bottom-16 md:bottom-0",
            )}
          >
            {actions.primary}
          </div>
        </>
      )}
    </div>
  );
}
