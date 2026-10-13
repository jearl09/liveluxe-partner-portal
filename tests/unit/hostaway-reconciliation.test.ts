import { describe, expect, it } from "vitest";
import {
  inspectWriteBack,
  isCancelledStatus,
  matchesBooking,
  normaliseUpstreamTimestamp,
} from "@/lib/domain/hostaway-reconciliation";
import { clampToNow, instantBeforeCheckIn } from "@/lib/domain/dates";

const booking = {
  reference: "LLX-1",
  checkIn: "2026-11-01",
  checkOut: "2026-11-10",
  guestEmail: "g@x.test",
  hostawayReservationId: null as number | null,
};
const res = (
  over: Partial<{
    id: number;
    status: string;
    arrivalDate: string;
    departureDate: string;
    guestEmail: string | null;
    platformReference: string | null;
  }>,
) => ({
  id: 1,
  status: "new",
  arrivalDate: "2026-11-01",
  departureDate: "2026-11-10",
  guestEmail: "g@x.test",
  platformReference: null,
  ...over,
});

describe("§17.3 write-back inspection", () => {
  it("matches by id, then by platform reference, then by dates + guest", () => {
    expect(matchesBooking(res({ id: 9 }), { ...booking, hostawayReservationId: 9 })).toBe(true);
    expect(matchesBooking(res({ arrivalDate: "2026-12-01", platformReference: "LLX-1" }), booking)).toBe(true);
    expect(matchesBooking(res({}), booking)).toBe(true);
    expect(matchesBooking(res({ guestEmail: "other@x.test" }), booking)).toBe(false);
    expect(matchesBooking(res({ status: "cancelled" }), booking)).toBe(false);
  });
  it("finds ours, duplicates, cancelled-upstream and missing", () => {
    const f = inspectWriteBack({ ...booking, hostawayReservationId: 1 }, [
      res({ id: 1 }),
      res({ id: 2 }),
      res({ id: 3, status: "cancelled" }),
    ]);
    expect(f.ours?.id).toBe(1);
    expect(f.duplicates.map((d) => d.id)).toEqual([2]);
    expect(f.cancelledUpstream).toBe(false);
    expect(f.missing).toBe(false);
    expect(
      inspectWriteBack({ ...booking, hostawayReservationId: 1 }, [res({ id: 1, status: "cancelledByOwner" })])
        .cancelledUpstream,
    ).toBe(true);
    expect(inspectWriteBack({ ...booking, hostawayReservationId: 1 }, [res({ id: 2 })]).missing).toBe(true);
    expect(inspectWriteBack(booking, []).ours).toBeNull();
    expect(isCancelledStatus("expired")).toBe(true);
    expect(isCancelledStatus(null)).toBe(false);
  });
  it("clamps future timestamps to now and reports the skew", () => {
    const now = new Date("2026-10-13T00:00:00Z");
    expect(normaliseUpstreamTimestamp("2026-10-13T01:00:00Z", now)).toEqual({
      value: now.toISOString(),
      skewed: true,
      skewMs: 3_600_000,
    });
    expect(normaliseUpstreamTimestamp("2026-10-12T00:00:00Z", now)).toMatchObject({ skewed: false });
    expect(normaliseUpstreamTimestamp("garbage", now)).toMatchObject({ value: null, skewed: false });
    expect(normaliseUpstreamTimestamp(null, now).value).toBeNull();
    expect(clampToNow(now.getTime() + 5, now)).toBe(now.getTime());
  });
  it("check-in release instant is DST-safe and property-local", () => {
    // AEDT (UTC+11) in November: 15:00 local = 04:00Z; minus 48 h.
    expect(instantBeforeCheckIn("2026-11-10", "15:00", "Australia/Melbourne", 48).toISOString()).toBe(
      "2026-11-08T04:00:00.000Z",
    );
    // AEST (UTC+10) in June, default 15:00 check-in.
    expect(instantBeforeCheckIn("2026-06-10", null, "Australia/Melbourne", 24).toISOString()).toBe(
      "2026-06-09T05:00:00.000Z",
    );
  });
});
