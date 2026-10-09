/**
 * Booking request state machine — spec §10.1 and Appendix B.
 *
 * Only the transitions in TRANSITIONS are legal. Anything else throws
 * INVALID_STATE_TRANSITION and must be logged as an integrity event by the
 * caller — never silently absorbed.
 *
 * This module is pure: no database, no framework imports (spec §3.2).
 */
import { DomainError } from "./errors";

export const BOOKING_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "COUNTER_OFFERED",
  "APPROVED",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "CHECKED_IN",
  "COMPLETED",
  "DECLINED",
  "EXPIRED",
  "CANCELLED",
  "FAILED",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type ActorType = "partner" | "livluxe" | "system";

/** Statuses that consume inventory and participate in the exclusion constraint (§7.2.1). */
export const INVENTORY_CONSUMING_STATUSES: readonly BookingStatus[] = [
  "APPROVED",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "CHECKED_IN",
];

/** Terminal states — final; reopening requires a new linked request. */
export const TERMINAL_STATUSES: readonly BookingStatus[] = ["COMPLETED", "DECLINED", "EXPIRED", "CANCELLED"];

export interface Transition {
  from: BookingStatus;
  to: BookingStatus;
  /** Which actor types may trigger this transition. */
  actors: readonly ActorType[];
  /** Human description of the side effects the caller must perform (Appendix B). */
  sideEffects: string;
}

export const TRANSITIONS: readonly Transition[] = [
  {
    from: "DRAFT",
    to: "SUBMITTED",
    actors: ["partner", "livluxe"],
    sideEffects: "Verify price hash; place hold; create PaymentIntent; notify ops; set submitted_at, decision_due_at.",
  },
  {
    from: "SUBMITTED",
    to: "UNDER_REVIEW",
    actors: ["livluxe", "system"],
    sideEffects: "Assign to ops; start SLA clock display.",
  },
  {
    from: "SUBMITTED",
    to: "EXPIRED",
    actors: ["system"],
    sideEffects: "Release hold; cancel PaymentIntent; notify both sides.",
  },
  {
    from: "UNDER_REVIEW",
    to: "EXPIRED",
    actors: ["system"],
    sideEffects: "Release hold; cancel PaymentIntent; notify both sides.",
  },
  {
    from: "UNDER_REVIEW",
    to: "COUNTER_OFFERED",
    actors: ["livluxe"],
    sideEffects: "New quote; extend hold; notify partner; pause SLA.",
  },
  { from: "COUNTER_OFFERED", to: "UNDER_REVIEW", actors: ["partner"], sideEffects: "Accept counter; resume SLA." },
  {
    from: "COUNTER_OFFERED",
    to: "EXPIRED",
    actors: ["system"],
    sideEffects: "Hold lapsed before the partner answered; release hold; notify both sides.",
  },
  { from: "COUNTER_OFFERED", to: "CANCELLED", actors: ["partner"], sideEffects: "Release hold; void authorisation." },
  {
    from: "UNDER_REVIEW",
    to: "APPROVED",
    actors: ["livluxe", "system"],
    sideEffects: "Live availability re-check; engage exclusion constraint; set approved_at, approved_by.",
  },
  {
    from: "UNDER_REVIEW",
    to: "DECLINED",
    actors: ["livluxe"],
    sideEffects: "Structured reason; release hold; void authorisation; notify with alternatives.",
  },
  {
    from: "APPROVED",
    to: "CONFIRMED",
    actors: ["system"],
    sideEffects:
      "Hostaway reservation created; payment captured; invoice issued; hold released; notifications sent; confirmed_at set.",
  },
  {
    from: "APPROVED",
    to: "AWAITING_PAYMENT",
    actors: ["system"],
    sideEffects: "Authorisation lapsed or invoice mode; request re-authorisation or await invoice payment.",
  },
  {
    from: "AWAITING_PAYMENT",
    to: "CONFIRMED",
    actors: ["system"],
    sideEffects: "Payment received; proceed as for APPROVED→CONFIRMED.",
  },
  {
    from: "APPROVED",
    to: "FAILED",
    actors: ["system"],
    sideEffects:
      "Write or capture failed unrecoverably; void authorisation; page ops; hold retained pending human decision.",
  },
  {
    from: "AWAITING_PAYMENT",
    to: "FAILED",
    actors: ["system"],
    sideEffects:
      "Write or capture failed unrecoverably; void authorisation; page ops; hold retained pending human decision.",
  },
  {
    from: "CONFIRMED",
    to: "CHECKED_IN",
    actors: ["system"],
    sideEffects: "Arrival date reached; access pack already released.",
  },
  {
    from: "CHECKED_IN",
    to: "COMPLETED",
    actors: ["system"],
    sideEffects: "Departure passed; feedback prompt; schedule credential purge.",
  },
  {
    from: "CONFIRMED",
    to: "CANCELLED",
    actors: ["partner", "livluxe"],
    sideEffects:
      "Policy refund calculated; Hostaway reservation cancelled; credit note if invoiced; notifications; credentials revoked.",
  },
  {
    from: "CHECKED_IN",
    to: "CANCELLED",
    actors: ["partner", "livluxe"],
    sideEffects:
      "Policy refund calculated; Hostaway reservation cancelled; credit note if invoiced; notifications; credentials revoked.",
  },
];

export function findTransition(from: BookingStatus, to: BookingStatus): Transition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export function canTransition(from: BookingStatus, to: BookingStatus, actor: ActorType): boolean {
  const t = findTransition(from, to);
  return !!t && t.actors.includes(actor);
}

/**
 * Validates a transition and returns it. Throws INVALID_STATE_TRANSITION otherwise.
 * The caller is responsible for appending to booking_status_history in the same
 * transaction as the status change (invariant 2, §10.1).
 */
export function assertTransition(from: BookingStatus, to: BookingStatus, actor: ActorType): Transition {
  const t = findTransition(from, to);
  if (!t) {
    throw new DomainError("INVALID_STATE_TRANSITION", { from, to, actor, reason: "no_such_transition" });
  }
  if (!t.actors.includes(actor)) {
    throw new DomainError("INVALID_STATE_TRANSITION", { from, to, actor, reason: "actor_not_permitted" });
  }
  return t;
}

export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function consumesInventory(status: BookingStatus): boolean {
  return INVENTORY_CONSUMING_STATUSES.includes(status);
}

/** Legal next states from a given status for a given actor — drives UI affordances. */
export function nextStates(from: BookingStatus, actor: ActorType): BookingStatus[] {
  return TRANSITIONS.filter((t) => t.from === from && t.actors.includes(actor)).map((t) => t.to);
}

export const DECLINE_REASON_CODES = [
  "no_availability",
  "unsuitable_property",
  "owner_block",
  "commercial_terms",
  "guest_profile",
  "maintenance",
  "other",
] as const;
export type DeclineReasonCode = (typeof DECLINE_REASON_CODES)[number];
