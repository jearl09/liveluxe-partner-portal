import { describe, expect, it } from "vitest";
import { ageLabel, requestProgress, syncState } from "@/lib/domain/progress";

const states = (s: ReturnType<typeof requestProgress>) => s.steps.map((x) => x.state[0]).join("");

describe("requestProgress (brief §13 rule 4)", () => {
  it("submitted / under review: Live Luxe reviewing is current", () => {
    expect(states(requestProgress({ status: "SUBMITTED" }))).toBe("dcuuu");
    expect(requestProgress({ status: "UNDER_REVIEW" }).waitingOn).toBe("livluxe");
  });
  it("counter-offer waits on the partner", () => {
    const p = requestProgress({ status: "COUNTER_OFFERED" });
    expect(states(p)).toBe("dcuuu");
    expect(p.waitingOn).toBe("partner");
  });
  it("approved: confirming is current; awaiting payment waits on the partner", () => {
    expect(states(requestProgress({ status: "APPROVED" }))).toBe("dddcu");
    expect(requestProgress({ status: "AWAITING_PAYMENT" }).waitingOn).toBe("partner");
  });
  it("confirmed: check-in details current until released, then all done", () => {
    expect(states(requestProgress({ status: "CONFIRMED" }))).toBe("ddddc");
    expect(states(requestProgress({ status: "CONFIRMED", checkinReleased: true }))).toBe("ddddd");
    expect(states(requestProgress({ status: "COMPLETED" }))).toBe("ddddd");
  });
  it("outcomes stop at the step they reached", () => {
    const declined = requestProgress({ status: "DECLINED", reachedBeforeEnd: "UNDER_REVIEW" });
    expect(states(declined)).toBe("dsuuu");
    expect(declined.outcome).toBe("Declined");
    const cancelled = requestProgress({ status: "CANCELLED", reachedBeforeEnd: "CONFIRMED" });
    expect(states(cancelled)).toBe("dddds");
    expect(requestProgress({ status: "FAILED", reachedBeforeEnd: "APPROVED" }).waitingOn).toBe("livluxe");
  });
});

describe("syncState", () => {
  const now = new Date("2026-10-14T03:00:00Z");
  it("live, delayed, degraded, unknown", () => {
    expect(syncState({ lastSyncIso: "2026-10-14T02:57:00Z", now, staleAfterMinutes: 30 })).toMatchObject({
      level: "live",
      ageMinutes: 3,
    });
    expect(syncState({ lastSyncIso: "2026-10-14T01:00:00Z", now, staleAfterMinutes: 30 }).level).toBe("delayed");
    expect(syncState({ lastSyncIso: "2026-10-14T02:59:00Z", now, staleAfterMinutes: 30, degraded: true }).level).toBe(
      "degraded",
    );
    expect(syncState({ lastSyncIso: null, now, staleAfterMinutes: 30 }).level).toBe("unknown");
  });
  it("age labels", () => {
    expect(ageLabel(0)).toBe("just now");
    expect(ageLabel(3)).toBe("3 min ago");
    expect(ageLabel(130)).toBe("2 h ago");
  });
});
