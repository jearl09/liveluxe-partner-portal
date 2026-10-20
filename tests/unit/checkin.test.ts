import { describe, expect, it } from "vitest";
import {
  canReleaseManually,
  checkinTier,
  checkinTiming,
  doorCodeVisible,
  normaliseOffset,
  releaseDue,
} from "@/lib/domain/checkin";
import { localToUtc } from "@/lib/domain/dates";

describe("localToUtc", () => {
  it("resolves Melbourne wall-clock in daylight saving (UTC+11)", () => {
    expect(localToUtc("2026-11-25", "15:00", "Australia/Melbourne").toISOString()).toBe("2026-11-25T04:00:00.000Z");
  });
  it("resolves Melbourne wall-clock in standard time (UTC+10)", () => {
    expect(localToUtc("2026-06-10", "10:00", "Australia/Melbourne").toISOString()).toBe("2026-06-10T00:00:00.000Z");
  });
  it("accepts HH:MM:SS as Postgres emits it", () => {
    expect(localToUtc("2026-06-10", "10:30:00", "Australia/Perth").toISOString()).toBe("2026-06-10T02:30:00.000Z");
  });
});

describe("checkinTiming", () => {
  const t = checkinTiming({
    checkIn: "2026-11-25",
    checkOut: "2026-11-30",
    timezone: "Australia/Melbourne",
    checkinFrom: "15:00:00",
    checkoutBy: "10:00:00",
    offsetHours: 48,
  });
  it("releases 48 h before the local check-in time", () => {
    expect(t.releaseDueAt.toISOString()).toBe("2026-11-23T04:00:00.000Z");
  });
  it("hides the pack 24 h after local checkout", () => {
    expect(t.hiddenFrom.toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });
  it("shows the door code 24 h before check-in by default, later than the pack (David, 20 Oct 2026)", () => {
    expect(t.doorCodeOffsetHours).toBe(24);
    expect(t.doorCodeDueAt.toISOString()).toBe("2026-11-24T04:00:00.000Z");
    const now = (iso: string) => new Date(iso);
    expect(doorCodeVisible({ tier: "full", doorCodeDueAt: t.doorCodeDueAt, now: now("2026-11-23T12:00:00Z") })).toBe(
      false,
    );
    expect(doorCodeVisible({ tier: "full", doorCodeDueAt: t.doorCodeDueAt, now: now("2026-11-24T04:00:00Z") })).toBe(
      true,
    );
    expect(doorCodeVisible({ tier: "address", doorCodeDueAt: t.doorCodeDueAt, now: now("2026-11-25T00:00:00Z") })).toBe(
      false,
    );
  });
  it("never shows the door code before the pack: the door-code offset is clamped to the pack offset", () => {
    const d = checkinTiming({
      checkIn: "2026-11-25",
      checkOut: "2026-11-30",
      timezone: "Australia/Melbourne",
      checkinFrom: "15:00:00",
      checkoutBy: "10:00:00",
      offsetHours: 12,
      doorCodeOffsetHours: 24,
    });
    expect(d.doorCodeOffsetHours).toBe(12);
    expect(d.doorCodeDueAt.getTime()).toBe(d.releaseDueAt.getTime());
    const same = checkinTiming({
      checkIn: "2026-11-25",
      checkOut: "2026-11-30",
      timezone: "Australia/Melbourne",
      checkinFrom: "15:00:00",
      checkoutBy: "10:00:00",
      offsetHours: 48,
      doorCodeOffsetHours: "bad" as unknown as number,
    });
    expect(same.doorCodeOffsetHours).toBe(24);
  });
  it("falls back to 15:00 / 10:00 and the 48 h default", () => {
    const d = checkinTiming({
      checkIn: "2026-06-10",
      checkOut: "2026-06-11",
      timezone: "Australia/Melbourne",
      checkinFrom: null,
      checkoutBy: null,
      offsetHours: "nope" as unknown as number,
    });
    expect(d.offsetHours).toBe(48);
    expect(d.checkInAt.toISOString()).toBe("2026-06-10T05:00:00.000Z");
    expect(d.checkOutAt.toISOString()).toBe("2026-06-11T00:00:00.000Z");
  });
});

describe("normaliseOffset", () => {
  it("accepts numbers and numeric strings, floors, rejects negatives", () => {
    expect(normaliseOffset(72)).toBe(72);
    expect(normaliseOffset("24")).toBe(24);
    expect(normaliseOffset(12.9)).toBe(12);
    expect(normaliseOffset(-1)).toBe(48);
    expect(normaliseOffset(null)).toBe(48);
    expect(normaliseOffset(null, 24)).toBe(24);
  });
});

describe("checkinTier (spec 8.4)", () => {
  const hiddenFrom = new Date("2026-11-30T23:00:00Z");
  const before = new Date("2026-11-24T00:00:00Z");
  const released = "2026-11-23T04:00:00Z";
  it("approx while pending, address once approved, full once released", () => {
    expect(checkinTier({ status: "UNDER_REVIEW", releasedAt: null, hiddenFrom, now: before })).toBe("approx");
    expect(checkinTier({ status: "AWAITING_PAYMENT", releasedAt: null, hiddenFrom, now: before })).toBe("approx");
    expect(checkinTier({ status: "APPROVED", releasedAt: null, hiddenFrom, now: before })).toBe("address");
    expect(checkinTier({ status: "CONFIRMED", releasedAt: null, hiddenFrom, now: before })).toBe("address");
    expect(checkinTier({ status: "CONFIRMED", releasedAt: released, hiddenFrom, now: before })).toBe("full");
  });
  it("hides the pack 24 h after checkout and revokes on cancellation", () => {
    const after = new Date("2026-12-01T00:00:00Z");
    expect(checkinTier({ status: "COMPLETED", releasedAt: released, hiddenFrom, now: after })).toBe("address");
    expect(checkinTier({ status: "CANCELLED", releasedAt: released, hiddenFrom, now: before })).toBe("none");
    expect(checkinTier({ status: "DECLINED", releasedAt: null, hiddenFrom, now: before })).toBe("none");
  });
});

describe("releaseDue / canReleaseManually", () => {
  const releaseDueAt = new Date("2026-11-23T04:00:00Z");
  const at = (s: string) => new Date(s);
  it("is due only when confirmed, unreleased and past the moment", () => {
    expect(releaseDue({ status: "CONFIRMED", releasedAt: null, releaseDueAt, now: at("2026-11-23T04:00:00Z") })).toBe(
      true,
    );
    expect(releaseDue({ status: "CONFIRMED", releasedAt: null, releaseDueAt, now: at("2026-11-23T03:59:00Z") })).toBe(
      false,
    );
    expect(releaseDue({ status: "APPROVED", releasedAt: null, releaseDueAt, now: at("2026-11-24T00:00:00Z") })).toBe(
      false,
    );
    expect(releaseDue({ status: "CONFIRMED", releasedAt: "x", releaseDueAt, now: at("2026-11-24T00:00:00Z") })).toBe(
      false,
    );
  });
  it("ops can release early only on a live paid booking", () => {
    expect(canReleaseManually("CONFIRMED", null)).toBe(true);
    expect(canReleaseManually("CHECKED_IN", null)).toBe(true);
    expect(canReleaseManually("APPROVED", null)).toBe(false);
    expect(canReleaseManually("CONFIRMED", "2026-11-23T04:00:00Z")).toBe(false);
  });
});
