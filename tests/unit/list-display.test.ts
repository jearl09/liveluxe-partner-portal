import { describe, expect, it } from "vitest";
import { BOOKING_STATUSES } from "@/lib/domain/booking-state-machine";
import {
  BOOKING_GROUP_STATUSES,
  maskGuest,
  parseBookingGroup,
  parseBookingSort,
  rowNextStep,
  type RowNextInput,
} from "@/lib/domain/list-display";

describe("maskGuest (brief §5.13)", () => {
  it("shows initial and surname", () => {
    expect(maskGuest("Jordan Citizen")).toBe("J. Citizen");
    expect(maskGuest("  mary   ann  van der berg ")).toBe("M. ann van der berg");
  });
  it("leaves single names and empties alone", () => {
    expect(maskGuest("tester1")).toBe("tester1");
    expect(maskGuest(null)).toBeNull();
    expect(maskGuest("  ")).toBeNull();
  });
});

describe("rowNextStep (brief §5.4)", () => {
  const base: RowNextInput = {
    status: "SUBMITTED",
    audience: "ops",
    now: new Date("2026-10-14T03:00:00Z"),
    decisionDueAt: "2026-10-14T05:00:00Z",
    holdExpiresAt: "2026-10-16T03:00:00Z",
    checkIn: "2026-11-25",
    checkOut: "2026-11-30",
    checkinReleasedAt: null,
    when: (iso) => `W${iso.slice(11, 16)}`,
    date: (d) => `D${d}`,
  };
  it("ops: decide by, flags overdue", () => {
    expect(rowNextStep(base)).toEqual({ text: "Decide by W05:00", urgent: false });
    expect(rowNextStep({ ...base, decisionDueAt: "2026-10-14T01:00:00Z" })).toEqual({
      text: "Was due W01:00",
      urgent: true,
    });
  });
  it("card needed comes first", () => {
    expect(rowNextStep({ ...base, cardNeeded: true }).text).toBe("Partner to hold a card");
    expect(rowNextStep({ ...base, audience: "partner", cardNeeded: true })).toEqual({
      text: "Authorise your card",
      urgent: true,
    });
  });
  it("a partner hears 'taking longer' only when Live Luxe has missed its reply-by time", () => {
    const partner = { ...base, audience: "partner" as const, status: "SUBMITTED" as const };
    expect(rowNextStep({ ...partner, decisionDueAt: "2099-01-01T00:00:00Z" }).text).toMatch(/^Reply by /);
    expect(rowNextStep({ ...partner, decisionDueAt: "2000-01-01T00:00:00Z" }).text).toBe("Taking longer than usual");
  });
  it("partner-side waits are urgent for the partner", () => {
    expect(rowNextStep({ ...base, audience: "partner", status: "COUNTER_OFFERED" }).urgent).toBe(true);
    expect(rowNextStep({ ...base, audience: "partner", status: "AWAITING_PAYMENT" }).text).toBe("Pay by W03:00");
  });
  it("confirmed and checked in", () => {
    expect(rowNextStep({ ...base, status: "CONFIRMED" }).text).toBe("Check-in D2026-11-25");
    expect(
      rowNextStep({ ...base, status: "CONFIRMED", checkinReleasesAt: "2026-11-23T03:00:00Z", day: (iso) => `Day${iso}` })
        .text,
    ).toBe("Check-in details on Day2026-11-23T03:00:00Z");
    expect(rowNextStep({ ...base, status: "CONFIRMED", checkinReleasedAt: "2026-11-23T03:00:00Z" }).text).toBe(
      "Check-in D2026-11-25",
    );
    expect(rowNextStep({ ...base, status: "CHECKED_IN" }).text).toBe("Check-out D2026-11-30");
    expect(rowNextStep({ ...base, status: "DECLINED" }).text).toBe("—");
  });
});

describe("booking groups and sort (brief §6.4)", () => {
  it("every status but Draft sits in exactly one group", () => {
    for (const s of BOOKING_STATUSES) {
      const n = Object.values(BOOKING_GROUP_STATUSES).filter((g) => g.includes(s)).length;
      expect(n).toBe(s === "DRAFT" ? 0 : 1);
    }
  });
  it("parses the group and the sort, with safe fallbacks", () => {
    expect(parseBookingGroup("live")).toBe("live");
    expect(parseBookingGroup("nope")).toBe("all");
    expect(parseBookingSort("checkin", "asc")).toEqual({ key: "checkin", dir: "asc" });
    expect(parseBookingSort("total", undefined)).toEqual({ key: "total", dir: "desc" });
    expect(parseBookingSort("constructor", "asc")).toEqual({ key: "updated", dir: "desc" });
  });
});

describe("partner groups and CSV (brief §7.6)", () => {
  it("maps old tabs onto the chips", async () => {
    const { parsePartnerGroup } = await import("@/lib/domain/list-display");
    expect(parsePartnerGroup("action")).toBe("action");
    expect(parsePartnerGroup(undefined, "upcoming")).toBe("confirmed");
    expect(parsePartnerGroup(undefined, "history")).toBe("closed");
    expect(parsePartnerGroup("nope")).toBe("all");
  });
  it("escapes CSV cells and blocks formulas", async () => {
    const { csvCell } = await import("@/lib/domain/list-display");
    expect(csvCell('Smith, "Jo"')).toBe('"Smith, ""Jo"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });
});
