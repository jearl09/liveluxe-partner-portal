import { describe, it, expect } from "vitest";
import {
  BOOKING_STATUSES,
  TRANSITIONS,
  assertTransition,
  canTransition,
  consumesInventory,
  isTerminal,
  nextStates,
  type BookingStatus,
} from "@/lib/domain/booking-state-machine";
import { DomainError } from "@/lib/domain/errors";

describe("booking state machine (spec §10.1, Appendix B)", () => {
  it("permits every transition listed in Appendix B", () => {
    expect(canTransition("DRAFT", "SUBMITTED", "partner")).toBe(true);
    expect(canTransition("SUBMITTED", "UNDER_REVIEW", "system")).toBe(true);
    expect(canTransition("UNDER_REVIEW", "APPROVED", "livluxe")).toBe(true);
    expect(canTransition("UNDER_REVIEW", "DECLINED", "livluxe")).toBe(true);
    expect(canTransition("UNDER_REVIEW", "COUNTER_OFFERED", "livluxe")).toBe(true);
    expect(canTransition("COUNTER_OFFERED", "UNDER_REVIEW", "partner")).toBe(true);
    expect(canTransition("APPROVED", "CONFIRMED", "system")).toBe(true);
    expect(canTransition("APPROVED", "AWAITING_PAYMENT", "system")).toBe(true);
    expect(canTransition("AWAITING_PAYMENT", "CONFIRMED", "system")).toBe(true);
    expect(canTransition("CONFIRMED", "CHECKED_IN", "system")).toBe(true);
    expect(canTransition("CHECKED_IN", "COMPLETED", "system")).toBe(true);
    expect(canTransition("CONFIRMED", "CANCELLED", "partner")).toBe(true);
  });

  it("rejects every transition NOT listed, for every actor", () => {
    const actors = ["partner", "livluxe", "system"] as const;
    let illegal = 0;
    for (const from of BOOKING_STATUSES) {
      for (const to of BOOKING_STATUSES) {
        for (const actor of actors) {
          const listed = TRANSITIONS.some((t) => t.from === from && t.to === to && t.actors.includes(actor));
          if (!listed) {
            illegal++;
            expect(() => assertTransition(from, to, actor)).toThrowError(DomainError);
            try {
              assertTransition(from, to, actor);
            } catch (e) {
              expect((e as DomainError).code).toBe("INVALID_STATE_TRANSITION");
            }
          }
        }
      }
    }
    expect(illegal).toBeGreaterThan(400); // sanity: the matrix is overwhelmingly closed
  });

  it("partners can never move a request into an approval state", () => {
    expect(canTransition("UNDER_REVIEW", "APPROVED", "partner")).toBe(false);
    expect(canTransition("APPROVED", "CONFIRMED", "partner")).toBe(false);
    expect(canTransition("UNDER_REVIEW", "DECLINED", "partner")).toBe(false);
  });

  it("terminal states have no outbound transitions", () => {
    const terminals: BookingStatus[] = ["COMPLETED", "DECLINED", "EXPIRED", "CANCELLED"];
    for (const s of terminals) {
      expect(isTerminal(s)).toBe(true);
      expect(nextStates(s, "partner")).toEqual([]);
      expect(nextStates(s, "livluxe")).toEqual([]);
      expect(nextStates(s, "system")).toEqual([]);
    }
  });

  it("only APPROVED / AWAITING_PAYMENT / CONFIRMED / CHECKED_IN consume inventory (§7.2.1)", () => {
    const consuming = BOOKING_STATUSES.filter(consumesInventory);
    expect(consuming.sort()).toEqual(["APPROVED", "AWAITING_PAYMENT", "CHECKED_IN", "CONFIRMED"]);
  });
});
