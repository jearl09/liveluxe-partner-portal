import { describe, expect, it } from "vitest";
import { inView, parseQueueView, queueCounts, queueSubtitle, type QueueRowFacts } from "@/lib/domain/queue";

const now = new Date("2026-10-14T03:00:00Z");
const row = (p: Partial<QueueRowFacts>): QueueRowFacts => ({
  band: "on_track",
  decisionDueAt: "2026-10-14T08:00:00Z",
  cardNeeded: false,
  ...p,
});
const dur = (ms: number) => `${Math.round(ms / 60_000)} min`;

describe("queue views (brief §6.3)", () => {
  it("partner-side rows are never counted as waiting on Live Luxe", () => {
    const paused = row({ band: "paused" });
    const noCard = row({ cardNeeded: true, band: "breached", decisionDueAt: "2026-10-14T01:00:00Z" });
    for (const r of [paused, noCard]) {
      expect(inView(r, "partner", now)).toBe(true);
      expect(inView(r, "waiting", now)).toBe(false);
      expect(inView(r, "breached", now)).toBe(false);
      expect(inView(r, "soon", now)).toBe(false);
    }
  });

  it("due within 2 h excludes breached rows and later deadlines", () => {
    expect(inView(row({ band: "at_risk", decisionDueAt: "2026-10-14T04:30:00Z" }), "soon", now)).toBe(true);
    expect(inView(row({ decisionDueAt: "2026-10-14T05:00:01Z" }), "soon", now)).toBe(false);
    expect(inView(row({ band: "breached", decisionDueAt: "2026-10-14T02:00:00Z" }), "soon", now)).toBe(false);
    expect(inView(row({ decisionDueAt: null }), "soon", now)).toBe(false);
  });

  it("counts and the subtitle", () => {
    const rows = [
      row({ band: "breached", decisionDueAt: "2026-10-14T02:00:00Z" }),
      row({ band: "at_risk", decisionDueAt: "2026-10-14T03:38:00Z" }),
      row({}),
      row({ band: "paused" }),
    ];
    const c = queueCounts(rows, now);
    expect(c).toMatchObject({ breached: 1, soon: 1, waiting: 3, partner: 1, atRisk: 1 });
    expect(c.nextDueAt).toBe("2026-10-14T03:38:00Z");
    expect(queueSubtitle(c, now, dur)).toBe("3 waiting · 1 at risk · 1 breached · next due in 38 min");
  });

  it("an empty queue says so plainly", () => {
    expect(queueSubtitle(queueCounts([], now), now, dur)).toBe("Nothing waiting on Live Luxe");
    expect(queueSubtitle(queueCounts([row({ cardNeeded: true })], now), now, dur)).toBe(
      "Nothing waiting on Live Luxe · 1 with the partner",
    );
  });

  it("parses the view from the URL", () => {
    expect(parseQueueView("soon")).toBe("soon");
    expect(parseQueueView(["partner"])).toBe("partner");
    expect(parseQueueView("nope")).toBeNull();
    expect(parseQueueView(undefined)).toBeNull();
  });
});
