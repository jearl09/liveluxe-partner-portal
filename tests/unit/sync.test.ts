import { describe, it, expect } from "vitest";
import { chunk, looksInternalListing, nextCalendarBatch, planListingSync } from "@/lib/domain/sync";

const existing = [
  { hostawayListingId: 1, contentHash: "a", isActive: true },
  { hostawayListingId: 2, contentHash: "b", isActive: true },
  { hostawayListingId: 3, contentHash: "c", isActive: true },
  { hostawayListingId: 4, contentHash: "d", isActive: false },
];

describe("planListingSync (spec §6.4)", () => {
  it("upserts new and changed, touches unchanged, deactivates absent on a complete fetch", () => {
    const plan = planListingSync(
      [
        { hostawayListingId: 1, contentHash: "a" }, // unchanged
        { hostawayListingId: 2, contentHash: "b2" }, // changed
        { hostawayListingId: 5, contentHash: "e" }, // new
      ],
      existing,
      true,
    );
    expect(plan.touch).toEqual([1]);
    expect(plan.upsert).toEqual([2, 5]);
    expect(plan.deactivate).toEqual([3]);
    expect(plan.reactivate).toEqual([]);
  });

  it("never deactivates on a partial fetch (§17.3)", () => {
    const plan = planListingSync([{ hostawayListingId: 1, contentHash: "a" }], existing, false);
    expect(plan.deactivate).toEqual([]);
    expect(plan.touch).toEqual([1]);
  });

  it("re-activates a listing that returns to the feed, even with an unchanged hash", () => {
    const plan = planListingSync([{ hostawayListingId: 4, contentHash: "d" }], existing, true);
    expect(plan.reactivate).toEqual([4]);
    expect(plan.upsert).toEqual([4]);
    expect(plan.deactivate).toEqual([1, 2, 3]);
  });

  it("does not deactivate already-inactive rows twice", () => {
    const plan = planListingSync([], existing, true);
    expect(plan.deactivate).toEqual([1, 2, 3]);
  });
});

describe("chunk", () => {
  it("splits evenly and keeps the remainder", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow(RangeError);
  });
});

describe("nextCalendarBatch (resumable cursor)", () => {
  const ids = [10, 20, 30, 40, 50];

  it("starts from the top with no cursor", () => {
    expect(nextCalendarBatch(ids, null, 2)).toEqual({ ids: [10, 20], nextCursor: 20, wrapped: false });
  });

  it("continues after the cursor and clears it at the end of a pass", () => {
    expect(nextCalendarBatch(ids, 20, 2)).toEqual({ ids: [30, 40], nextCursor: 40, wrapped: false });
    expect(nextCalendarBatch(ids, 40, 2)).toEqual({ ids: [50], nextCursor: null, wrapped: false });
  });

  it("wraps to the start when the cursor is past every id (listing removed)", () => {
    expect(nextCalendarBatch(ids, 99, 2)).toEqual({ ids: [10, 20], nextCursor: 20, wrapped: true });
  });

  it("handles an empty catalogue", () => {
    expect(nextCalendarBatch([], 5, 2)).toEqual({ ids: [], nextCursor: null, wrapped: false });
  });
});

describe("looksInternalListing", () => {
  it("flags cleaning / discarded / test pseudo-listings and nothing else", () => {
    expect(looksInternalListing("CLEANING - 3405/160 Victoria St")).toBe(true);
    expect(looksInternalListing("[DISCARDED] 1415/673 La Trobe Street Docklands")).toBe(true);
    expect(looksInternalListing(" Test listing")).toBe(true);
    expect(looksInternalListing("1311/677 La Trobe Street Docklands")).toBe(false);
    expect(looksInternalListing("Live Luxe | Cozy & Central 1B Studio at QV Market")).toBe(false);
    expect(looksInternalListing("Cleanly furnished apartment")).toBe(false);
  });
});
