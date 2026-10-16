import { describe, expect, it } from "vitest";
import { resolveAvailability, type CalendarDay } from "@/lib/domain/availability";
import { addDays } from "@/lib/domain/dates";
import {
  blockText,
  buildStayCalendar,
  checkInBlock,
  checkOutBlock,
  dayBlock,
  lastCheckOut,
  nearestOpenStays,
  validCheckOuts,
  type StayCalendar,
} from "@/lib/domain/stay-picker";

const TODAY = "2026-11-01";

/** 60 synced, priced, open nights from TODAY, with overrides per date. */
function days(overrides: Record<string, Partial<CalendarDay>> = {}, count = 60): CalendarDay[] {
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(TODAY, i);
    return {
      date,
      status: "available",
      isAvailable: true,
      allotment: null,
      priceCents: 20000,
      minStay: null,
      closedOnArrival: false,
      closedOnDeparture: false,
      ...overrides[date],
    } satisfies CalendarDay;
  });
}
const booked = { status: "reserved", isAvailable: false } as const;

function cal(
  overrides: Record<string, Partial<CalendarDay>> = {},
  opts: {
    minNights?: number;
    maxNights?: number | null;
    taken?: { start: string; end: string }[];
    count?: number;
  } = {},
): StayCalendar {
  return buildStayCalendar(days(overrides, opts.count), opts.taken ?? [], TODAY, 60, {
    minNights: opts.minNights ?? 1,
    maxNights: opts.maxNights ?? null,
  });
}

describe("stay picker: building the nights", () => {
  it("labels open, booked, unsynced and unpriced nights", () => {
    const c = cal({ "2026-11-03": booked, "2026-11-04": { priceCents: null } }, { count: 10 });
    const state = (d: string) => c.nights.find((n) => n.date === d)!.state;
    expect(state("2026-11-02")).toBe("open");
    expect(state("2026-11-03")).toBe("booked");
    expect(state("2026-11-04")).toBe("unpriced");
    expect(state("2026-11-20")).toBe("unsynced"); // beyond the 10 synced days
  });

  it("applies the allotment rule: a multi-unit night is open while units remain", () => {
    const c = cal({
      "2026-11-05": { allotment: 2, isAvailable: false, status: "reserved" },
      "2026-11-06": { allotment: 0 },
    });
    expect(c.nights[4]!.state).toBe("open");
    expect(c.nights[5]!.state).toBe("booked");
  });

  it("treats live holds and approved bookings as booked", () => {
    const c = cal({}, { taken: [{ start: "2026-11-10", end: "2026-11-12" }] });
    expect(c.nights.filter((n) => n.state === "booked").map((n) => n.date)).toEqual(["2026-11-10", "2026-11-11"]);
    expect(checkInBlock(c, "2026-11-10")).toEqual({ code: "booked" });
    // A hold's end is its check-out: that night is free again.
    expect(checkInBlock(c, "2026-11-12")).toBeNull();
  });
});

describe("stay picker: check-in", () => {
  it("refuses past days, booked nights, unsynced and unpriced nights", () => {
    const c = cal({ "2026-11-03": booked, "2026-11-04": { priceCents: null } }, { count: 10 });
    expect(checkInBlock(c, "2026-10-31")).toEqual({ code: "past" });
    expect(checkInBlock(c, "2026-11-03")).toEqual({ code: "booked" });
    expect(checkInBlock(c, "2026-11-04")).toEqual({ code: "unpriced" });
    expect(checkInBlock(c, "2026-11-25")).toEqual({ code: "unsynced" });
    expect(checkInBlock(c, TODAY)).toBeNull();
  });

  it("refuses a closed-on-arrival day", () => {
    const c = cal({ "2026-11-05": { closedOnArrival: true } });
    expect(checkInBlock(c, "2026-11-05")).toEqual({ code: "closed_on_arrival" });
    expect(blockText({ code: "closed_on_arrival" })).toBe("Check-in not available on this day");
  });

  it("refuses an open night when no stay of the minimum length fits before the next booking", () => {
    const c = cal({ "2026-11-08": booked }, { minNights: 7 });
    // 1 → 8 Nov is exactly 7 nights; from the 2nd only 6 fit.
    expect(checkInBlock(c, "2026-11-01")).toBeNull();
    expect(checkInBlock(c, "2026-11-02")).toEqual({ code: "no_stay_fits", nights: 7 });
  });

  it("names the night's own minimum when it is stricter than the listing's", () => {
    const c = cal({ "2026-11-17": { minStay: 2 }, "2026-11-18": booked });
    expect(checkInBlock(c, "2026-11-17")).toEqual({ code: "no_stay_fits", nights: 2 });
  });
});

describe("stay picker: check-out", () => {
  it("never lets a stay span a booked night", () => {
    const c = cal({ "2026-11-18": booked, "2026-11-19": booked });
    expect(checkOutBlock(c, "2026-11-15", "2026-11-20")).toEqual({
      code: "crosses",
      night: "2026-11-18",
      state: "booked",
    });
    expect(blockText(checkOutBlock(c, "2026-11-15", "2026-11-22")!)).toBe(
      "The stay would cross a booked night (Wed 18 Nov)",
    );
  });

  it("allows check-out on the first booked day (back-to-back)", () => {
    const c = cal({ "2026-11-18": booked });
    expect(checkOutBlock(c, "2026-11-15", "2026-11-18")).toBeNull();
    expect(lastCheckOut(c, "2026-11-15")).toBe("2026-11-18");
    expect(validCheckOuts(c, "2026-11-15")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
  });

  it("enforces the minimum stay, the strictest night in the range winning", () => {
    const c = cal({ "2026-11-12": { minStay: 5 } }, { minNights: 3 });
    expect(checkOutBlock(c, "2026-11-10", "2026-11-12")).toEqual({ code: "min_stay", nights: 3 });
    // The range now includes the 12th, whose own minimum is 5.
    expect(checkOutBlock(c, "2026-11-10", "2026-11-14")).toEqual({ code: "min_stay", nights: 5 });
    expect(checkOutBlock(c, "2026-11-10", "2026-11-15")).toBeNull();
    expect(blockText({ code: "min_stay", nights: 7 })).toBe("Minimum 7 nights from here");
  });

  it("enforces the maximum stay", () => {
    const c = cal({}, { maxNights: 14 });
    expect(checkOutBlock(c, "2026-11-01", "2026-11-15")).toBeNull();
    expect(checkOutBlock(c, "2026-11-01", "2026-11-16")).toEqual({ code: "max_stay", nights: 14 });
  });

  it("refuses a closed-on-departure day", () => {
    const c = cal({ "2026-11-06": { closedOnDeparture: true } });
    expect(checkOutBlock(c, "2026-11-02", "2026-11-06")).toEqual({ code: "closed_on_departure" });
    expect(checkOutBlock(c, "2026-11-02", "2026-11-07")).toBeNull();
  });

  it("refuses a stay through a hold or past the synced window", () => {
    const c = cal({}, { taken: [{ start: "2026-11-20", end: "2026-11-25" }], count: 30 });
    expect(checkOutBlock(c, "2026-11-15", "2026-11-22")).toMatchObject({ code: "crosses", state: "booked" });
    expect(checkOutBlock(c, "2026-11-28", "2026-12-03")).toMatchObject({ code: "crosses", state: "unsynced" });
  });
});

describe("stay picker: one day's state while choosing", () => {
  it("judges later days as check-outs and earlier ones as new check-ins", () => {
    const c = cal({ "2026-11-03": booked, "2026-11-10": booked });
    expect(dayBlock(c, "2026-11-08", "2026-11-05")).toBeNull(); // valid check-out
    expect(dayBlock(c, "2026-11-12", "2026-11-05")).toMatchObject({ code: "crosses" });
    expect(dayBlock(c, "2026-11-03", "2026-11-05")).toEqual({ code: "booked" }); // earlier: as a check-in
    expect(dayBlock(c, "2026-11-02", "2026-11-05")).toBeNull();
  });
});

describe("stay picker agrees with the server's quote check", () => {
  it("every check-out the picker offers is a stay the server would price", () => {
    const overrides = {
      "2026-11-04": booked,
      "2026-11-09": { minStay: 4 },
      "2026-11-14": { closedOnArrival: true },
      "2026-11-17": { closedOnDeparture: true },
      "2026-11-22": { priceCents: null },
    } satisfies Record<string, Partial<CalendarDay>>;
    const rows = days(overrides);
    const limits = { minNights: 2, maxNights: 10, maxGuests: 4, maxPets: 0 };
    const c = buildStayCalendar(rows, [], TODAY, 60, limits);
    for (let i = 0; i < 40; i++) {
      const checkIn = addDays(TODAY, i);
      for (let n = 1; n <= 12; n++) {
        const checkOut = addDays(checkIn, n);
        const server = resolveAvailability(rows, limits, { checkIn, checkOut, adults: 1, children: 0, pets: 0 });
        const picker = checkOutBlock(c, checkIn, checkOut) === null;
        expect(picker, `${checkIn} → ${checkOut}`).toBe(server.available && server.quotable);
        // The fast scan behind the check-in rule agrees with the full check.
        expect(validCheckOuts(c, checkIn).includes(checkOut), `scan ${checkIn} → ${checkOut}`).toBe(picker);
      }
    }
  });
});

describe("stay picker: nearest open dates", () => {
  it("offers the closest stays of the same length, checking later before earlier at each distance", () => {
    const c = cal({ "2026-11-10": booked, "2026-11-11": booked });
    // 8 → 11 crosses the 10th; a day later still does, a day earlier ends on the booked 10th (allowed).
    expect(nearestOpenStays(c, "2026-11-08", 3)).toEqual([
      { checkIn: "2026-11-07", checkOut: "2026-11-10" },
      { checkIn: "2026-11-06", checkOut: "2026-11-09" },
    ]);
    expect(nearestOpenStays(c, "2026-11-10", 2, 1)).toEqual([{ checkIn: "2026-11-12", checkOut: "2026-11-14" }]);
  });
});
