import { describe, expect, it } from "vitest";
import { BOOKING_STATUSES } from "@/lib/domain/booking-state-machine";
import { STATUS_LABELS, formatDuration, nounFor, slaBadge, statusTone } from "@/lib/domain/status";

describe("status vocabulary (brief §2.3)", () => {
  it("labels all thirteen statuses in sentence case", () => {
    for (const s of BOOKING_STATUSES) {
      expect(STATUS_LABELS[s]).toBeTruthy();
      expect(STATUS_LABELS[s]).toMatch(/^[A-Z][a-z]/);
    }
    expect(STATUS_LABELS.COUNTER_OFFERED).toBe("Counter-offer");
  });

  it("outcomes are muted, only Failed is danger", () => {
    expect(statusTone("DECLINED")).toBe("muted");
    expect(statusTone("EXPIRED")).toBe("muted");
    expect(statusTone("CANCELLED")).toBe("muted");
    expect(statusTone("FAILED")).toBe("danger");
  });

  it("maps the rest per the brief", () => {
    expect(statusTone("DRAFT")).toBe("neutral");
    expect(statusTone("SUBMITTED")).toBe("info");
    expect(statusTone("UNDER_REVIEW")).toBe("info");
    expect(statusTone("COUNTER_OFFERED")).toBe("attention");
    expect(statusTone("AWAITING_PAYMENT")).toBe("attention");
    expect(statusTone("APPROVED")).toBe("success-soft");
    expect(statusTone("CONFIRMED")).toBe("success");
    expect(statusTone("CHECKED_IN")).toBe("success");
    expect(statusTone("COMPLETED")).toBe("neutral");
  });

  it("calls it a request until confirmed", () => {
    expect(nounFor("AWAITING_PAYMENT")).toBe("request");
    expect(nounFor("CONFIRMED")).toBe("booking");
    expect(nounFor("COMPLETED")).toBe("booking");
  });
});

describe("formatDuration (brief §11.1)", () => {
  it("uses at most two units with spaces", () => {
    expect(formatDuration(80 * 60_000)).toBe("1 h 20 m");
    expect(formatDuration(26 * 3_600_000)).toBe("1 d 2 h");
    expect(formatDuration(40 * 60_000)).toBe("40 m");
    expect(formatDuration(2 * 3_600_000)).toBe("2 h");
    expect(formatDuration(0)).toBe("1 m");
    expect(formatDuration(-90 * 60_000)).toBe("1 h 30 m");
  });
});

describe("slaBadge (brief §4.6)", () => {
  const now = new Date("2026-10-14T03:00:00Z");
  const submitted = "2026-10-14T00:00:00Z";
  const dueIn2h = "2026-10-14T05:00:00Z";
  const dueIn30m = "2026-10-14T03:30:00Z";
  const overdue = "2026-10-13T01:00:00Z";

  it("renders nothing unless the clock is running", () => {
    for (const s of ["APPROVED", "CONFIRMED", "DECLINED", "CANCELLED", "EXPIRED", "FAILED", "DRAFT"] as const) {
      expect(slaBadge({ status: s, submittedAt: submitted, decisionDueAt: overdue, now })).toBeNull();
    }
    expect(slaBadge({ status: "SUBMITTED", submittedAt: submitted, decisionDueAt: null, now })).toBeNull();
  });

  it("on track / at risk / breached wording and tone", () => {
    expect(slaBadge({ status: "SUBMITTED", submittedAt: submitted, decisionDueAt: dueIn2h, now })).toMatchObject({
      tone: "info",
      label: "Due in 2 h",
    });
    expect(slaBadge({ status: "UNDER_REVIEW", submittedAt: submitted, decisionDueAt: dueIn30m, now })).toMatchObject({
      tone: "attention",
      label: "Due in 30 m",
    });
    expect(slaBadge({ status: "SUBMITTED", submittedAt: submitted, decisionDueAt: overdue, now })).toMatchObject({
      tone: "danger",
      label: "Overdue by 1 d 2 h",
    });
  });

  it("a paused counter-offer says it is waiting on the partner", () => {
    const b = slaBadge({
      status: "COUNTER_OFFERED",
      submittedAt: submitted,
      decisionDueAt: dueIn2h,
      pausedAt: "2026-10-14T00:40:00Z",
      now,
      formatPausedAt: () => "11:40 am AEDT",
    });
    expect(b).toMatchObject({ tone: "muted", label: "Waiting on partner since 11:40 am AEDT" });
  });
});
