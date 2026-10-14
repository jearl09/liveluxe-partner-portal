import { describe, expect, it } from "vitest";
import { rowNextStep } from "@/lib/domain/list-display";
import { CONFIRM_STALLED_AFTER_MS, confirmationStalled } from "@/lib/domain/next-step";

const now = new Date("2026-10-14T08:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const row = (approvedAt: string | null, audience: "partner" | "ops" = "partner") =>
  rowNextStep({
    status: "APPROVED",
    audience,
    now,
    decisionDueAt: null,
    holdExpiresAt: null,
    checkIn: "2026-11-01",
    checkOut: "2026-12-01",
    checkinReleasedAt: null,
    approvedAt,
    when: (iso) => iso,
    date: (d) => d,
  });

describe("stalled confirmation", () => {
  it("is in progress for the first minutes after approval", () => {
    expect(confirmationStalled(ago(60_000), now)).toBe(false);
    expect(row(ago(60_000)).text).toBe("Confirming");
  });

  it("says so once it has taken longer than the window", () => {
    expect(confirmationStalled(ago(CONFIRM_STALLED_AFTER_MS + 1), now)).toBe(true);
    expect(row(ago(CONFIRM_STALLED_AFTER_MS + 1))).toEqual({ text: "Taking longer than usual", urgent: false });
    expect(row(ago(CONFIRM_STALLED_AFTER_MS + 1), "ops")).toEqual({ text: "Confirmation stalled", urgent: true });
  });

  it("does not guess without an approval time", () => {
    expect(confirmationStalled(null, now)).toBe(false);
    expect(row(null).text).toBe("Confirming");
  });
});
