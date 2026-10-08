import { describe, it, expect } from "vitest";
import { addDays, calendarWindow, daysBetween, isIsoDate, todayIn } from "@/lib/domain/dates";

describe("calendar-date arithmetic (spec §17.1)", () => {
  it("validates ISO dates strictly", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("26-01-01")).toBe(false);
    expect(isIsoDate(20260101)).toBe(false);
  });

  it("adds days across month, year and DST boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-03", 2)).toBe("2026-10-05"); // AEDT starts 4 Oct 2026
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days, signed", () => {
    expect(daysBetween("2026-11-10", "2026-11-14")).toBe(4);
    expect(daysBetween("2026-11-14", "2026-11-10")).toBe(-4);
    expect(daysBetween("2026-11-10", "2026-11-10")).toBe(0);
  });

  it("derives today in the property timezone", () => {
    // 23:30 UTC on 8 Oct is already 9 Oct in Melbourne (UTC+11 during AEDT).
    expect(todayIn("Australia/Melbourne", new Date("2026-10-08T23:30:00Z"))).toBe("2026-10-09");
    expect(todayIn("UTC", new Date("2026-10-08T23:30:00Z"))).toBe("2026-10-08");
  });

  it("builds the near and far sync windows", () => {
    expect(calendarWindow("near", "2026-10-08")).toEqual({ from: "2026-10-08", to: "2027-02-05" });
    expect(calendarWindow("far", "2026-10-08")).toEqual({ from: "2027-02-06", to: "2027-11-12" });
  });
});
