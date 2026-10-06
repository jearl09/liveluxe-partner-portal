import { describe, it, expect } from "vitest";
import {
  buildAgenda,
  buildRequestRows,
  computeKpis,
  deriveAttention,
  evaluateFreshness,
  firstName,
  greetingForHour,
  humanizeDuration,
  statusTone,
  type DashboardRequestRow,
} from "@/lib/domain/dashboard";

const now = new Date("2026-10-06T03:00:00Z"); // 14:00 AEDT, Tuesday 6 Oct
const fmt = { timestamp: (iso: string) => `T(${iso})` };

function row(p: Partial<DashboardRequestRow> & Pick<DashboardRequestRow, "id" | "status">): DashboardRequestRow {
  return {
    reference: `LLX-2026-${p.id.padStart(6, "0")}`,
    propertyName: "Tower A 1203",
    suburb: "Docklands",
    checkIn: "2026-10-20",
    checkOut: "2026-11-20",
    nights: 31,
    guestName: "Priya Natarajan",
    claimRef: null,
    poNumber: null,
    totalFormatted: "AUD $9,169.20",
    decisionDueAt: null,
    holdExpiresAt: null,
    checkinReleasedAt: null,
    checkinReleasesAt: null,
    unreadComments: 0,
    paymentDue: false,
    ...p,
  };
}

describe("dashboard view-model", () => {
  it("greets by hour and uses the user record for the first name", () => {
    expect(greetingForHour(8)).toBe("Good morning");
    expect(greetingForHour(14)).toBe("Good afternoon");
    expect(greetingForHour(21)).toBe("Good evening");
    expect(firstName("Claudia Rossi")).toBe("Claudia");
    expect(firstName(null)).toBe("there");
  });

  it("humanises durations", () => {
    expect(humanizeDuration(2 * 3_600_000 + 15 * 60_000)).toBe("2 h 15 m");
    expect(humanizeDuration(40 * 60_000)).toBe("40 m");
    expect(humanizeDuration(3 * 86_400_000 + 4 * 3_600_000)).toBe("3 d 4 h");
    expect(humanizeDuration(-30 * 60_000)).toBe("overdue by 30 m");
  });

  it("maps every status to the shared pill tones", () => {
    expect(statusTone("SUBMITTED")).toBe("navy-outline");
    expect(statusTone("COUNTER_OFFERED")).toBe("gold");
    expect(statusTone("AWAITING_PAYMENT")).toBe("gold-filled");
    expect(statusTone("CONFIRMED")).toBe("green");
    expect(statusTone("DECLINED")).toBe("muted");
    expect(statusTone("FAILED")).toBe("red");
  });

  it("builds the attention strip, most urgent first, capped at four", () => {
    const rows = [
      row({ id: "1", status: "COUNTER_OFFERED", holdExpiresAt: "2026-10-07T05:12:00Z" }),
      row({ id: "2", status: "AWAITING_PAYMENT", paymentDue: true, holdExpiresAt: "2026-10-06T04:40:00Z" }),
      row({ id: "3", status: "UNDER_REVIEW", unreadComments: 2 }),
      row({ id: "4", status: "SUBMITTED", holdExpiresAt: "2026-10-06T04:40:00Z" }),
      row({ id: "5", status: "SUBMITTED", holdExpiresAt: "2026-10-06T04:50:00Z" }),
      row({ id: "6", status: "CONFIRMED" }),
    ];
    const items = deriveAttention(rows, now, fmt);
    expect(items.map((i) => i.kind)).toEqual(["payment_due", "hold_expiring", "hold_expiring", "ops_reply"]);
    expect(items[0]!.title).toBe("Payment due · AUD $9,169.20");
    expect(items[1]!.title).toBe("Hold expires in 1 h 40 m");
    expect(items[1]!.context).toBe("LLX-2026-000004 · Tower A 1203");
    expect(deriveAttention([row({ id: "9", status: "CONFIRMED" })], now, fmt)).toEqual([]);
  });

  it("computes KPIs for the next seven days in the property timezone", () => {
    const rows = [
      row({ id: "1", status: "CONFIRMED", checkIn: "2026-10-01", checkOut: "2026-10-09" }), // active, out Fri 9
      row({ id: "2", status: "CHECKED_IN", checkIn: "2026-09-20", checkOut: "2026-10-30" }), // active
      row({ id: "3", status: "CONFIRMED", checkIn: "2026-10-08", checkOut: "2026-11-08" }), // in Thu 8
      row({ id: "4", status: "CONFIRMED", checkIn: "2026-10-08", checkOut: "2026-11-08" }), // in Thu 8
      row({ id: "5", status: "SUBMITTED" }),
      row({ id: "6", status: "UNDER_REVIEW" }),
      row({ id: "7", status: "DECLINED", checkIn: "2026-10-07" }),
    ];
    expect(computeKpis(rows, now)).toEqual({
      activePlacements: 2,
      pendingWithLivluxe: 2,
      checkInsNext7: 2,
      checkOutsNext7: 1,
      nextCheckInLabel: "2 arriving Thursday",
      nextCheckOutLabel: "1 departing Friday",
    });
  });

  it("orders the requests table: partner action first, then by due time", () => {
    const rows = [
      row({ id: "1", status: "SUBMITTED", decisionDueAt: "2026-10-06T05:15:00Z" }),
      row({ id: "2", status: "CONFIRMED", checkinReleasesAt: "2026-10-18T03:00:00Z" }),
      row({ id: "3", status: "COUNTER_OFFERED" }),
      row({ id: "4", status: "SUBMITTED", decisionDueAt: "2026-10-06T02:30:00Z" }),
      row({ id: "5", status: "CANCELLED" }),
    ];
    const table = buildRequestRows(rows, now, fmt);
    expect(table.map((r) => r.id)).toEqual(["3", "4", "1", "2"]);
    expect(table[0]!.dueLabel).toBe("Your reply needed");
    expect(table[1]!.dueLabel).toBe("Decision overdue by 30 m");
    expect(table[1]!.dueTone).toBe("red");
    expect(table[2]!.dueLabel).toBe("Decision due in 2 h 15 m");
    expect(table[3]!.dueLabel).toBe("Check-in pack releases T(2026-10-18T03:00:00Z)");
  });

  it("builds a 7-day agenda with access-pack notes", () => {
    const rows = [
      row({
        id: "1",
        status: "CONFIRMED",
        checkIn: "2026-10-08",
        checkOut: "2026-11-08",
        checkinReleasedAt: "2026-10-06T00:00:00Z",
      }),
      row({
        id: "2",
        status: "CHECKED_IN",
        checkIn: "2026-09-01",
        checkOut: "2026-10-07",
        guestName: "Tom Barker-Lee",
      }),
      row({ id: "3", status: "CONFIRMED", checkIn: "2026-10-30", checkOut: "2026-12-01" }),
    ];
    const agenda = buildAgenda(rows, now);
    expect(agenda.map((e) => [e.direction, e.guestSurname, e.dayLabel, e.accessNote])).toEqual([
      ["out", "Barker-Lee", "Wed 7 Oct", null],
      ["in", "Natarajan", "Thu 8 Oct", "Access details released"],
    ]);
  });

  it("reports availability freshness against the configured threshold", () => {
    expect(evaluateFreshness("2026-10-06T02:57:00Z", now, 30)).toEqual({
      state: "fresh",
      label: "Availability synced 3 min ago",
    });
    expect(evaluateFreshness("2026-10-06T01:00:00Z", now, 30).state).toBe("stale");
    expect(evaluateFreshness(null, now, 30).state).toBe("unknown");
  });
});
