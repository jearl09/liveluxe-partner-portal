import { describe, expect, it } from "vitest";
import { formatClock, formatWhen } from "@/lib/utils";

describe("formatWhen (brief §13 rule 2)", () => {
  const now = new Date("2026-10-14T01:00:00Z"); // 12:00 pm Wed 14 Oct AEDT
  it("says today and tomorrow in the property's zone", () => {
    expect(formatWhen("2026-10-14T04:00:00Z", now)).toBe("3:00 pm today AEDT");
    expect(formatWhen("2026-10-14T22:30:00Z", now)).toBe("9:30 am tomorrow AEDT");
  });
  it("names the weekday further out", () => {
    expect(formatWhen("2026-10-20T04:00:00Z", now)).toBe("Tue 20 Oct, 3:00 pm AEDT");
  });
});

describe("formatClock", () => {
  it("renders Postgres times", () => {
    expect(formatClock("15:00:00")).toBe("3:00 pm");
    expect(formatClock("10:30")).toBe("10:30 am");
    expect(formatClock("00:00")).toBe("12:00 am");
    expect(formatClock(null)).toBeNull();
  });
});
