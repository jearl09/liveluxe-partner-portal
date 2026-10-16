import { describe, expect, it } from "vitest";
import { BOOKING_STATUSES } from "@/lib/domain/booking-state-machine";
import { nextStep, type NextStepInput } from "@/lib/domain/next-step";

const base: NextStepInput = {
  audience: "partner",
  status: "SUBMITTED",
  now: new Date("2026-10-14T01:00:00Z"),
  mode: "card_authorise",
  decisionDueAt: "2026-10-14T04:00:00Z",
  holdExpiresAt: "2026-10-16T01:00:00Z",
  slaPaused: false,
  checkIn: "2026-11-25",
  checkOut: "2026-11-30",
  checkinFrom: "3:00 pm",
  checkoutBy: "10:00 am",
  checkinReleaseAt: "2026-11-23T04:00:00Z",
  checkinReleasedAt: null,
  balanceDueAt: null,
  balancePaidAt: null,
  declineReason: null,
  cancelledAt: null,
  refundCents: null,
  when: (iso) => `W(${iso.slice(0, 16)})`,
  date: (d) => `D(${d})`,
  money: (c) => `$${c / 100}`,
  duration: (ms) => `${Math.round(ms / 3_600_000)} h`,
};

describe("nextStep (brief §2.3, §13)", () => {
  it("has a sentence for every status, both audiences", () => {
    for (const status of BOOKING_STATUSES)
      for (const audience of ["partner", "ops"] as const) {
        const s = nextStep({ ...base, status, audience });
        expect(s.title.length).toBeGreaterThan(3);
        expect(s.body.length).toBeGreaterThan(5);
      }
  });

  it("partner: says when Live Luxe will reply and that nothing is charged yet", () => {
    const s = nextStep(base);
    expect(s.body).toContain("We'll reply by W(2026-10-14T04:00)");
    expect(s.body).toContain("nothing is charged");
  });

  it("card modes: an unheld request asks for the card first, on both sides", () => {
    expect(nextStep({ ...base, cardNeeded: true }).title).toBe("One more step: authorise your card");
    expect(nextStep({ ...base, audience: "ops", cardNeeded: true }).tone).toBe("attention");
  });

  it("partner: confirmed says when check-in details arrive (task b)", () => {
    const s = nextStep({ ...base, status: "CONFIRMED" });
    expect(s.body).toContain("door code and Wi-Fi W(2026-11-23T04:00)");
    expect(s.body).toContain("Check-in D(2026-11-25) from 3:00 pm");
  });

  it("ops: overdue is danger, outcomes are muted", () => {
    expect(nextStep({ ...base, audience: "ops", decisionDueAt: "2026-10-13T01:00:00Z" }).tone).toBe("danger");
    for (const status of ["DECLINED", "EXPIRED", "CANCELLED"] as const)
      expect(nextStep({ ...base, status }).tone).toBe("muted");
    expect(nextStep({ ...base, status: "FAILED" }).tone).toBe("danger");
  });

  it("partner copy never says Hostaway, sync or SLA", () => {
    for (const status of BOOKING_STATUSES) {
      const s = nextStep({ ...base, status });
      expect(`${s.title} ${s.body}`).not.toMatch(/hostaway|sync|sla/i);
    }
  });
});
