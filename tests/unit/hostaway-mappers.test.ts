import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { HostawayListing, HostawayCalendarDay } from "@/lib/hostaway/types";
import { mapCalendarDay, mapListing } from "@/lib/hostaway/mappers";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/hostaway/listing.json", import.meta.url), "utf8"));

describe("mapListing (spec §6.6)", () => {
  const src = HostawayListing.parse(fixture.result);
  const { listing, access } = mapListing(src);

  it("converts money to integer cents and hours to times", () => {
    expect(listing.base_price_cents).toBe(31000);
    expect(listing.cleaning_fee_cents).toBe(25000);
    expect(listing.security_deposit_cents).toBe(100000);
    expect(listing.checkin_from).toBe("15:00:00");
    expect(listing.checkout_by).toBe("10:00:00");
  });

  it("wraps check-in hours past midnight and drops nonsense (Hostaway allows 26 = 2 am)", () => {
    const late = mapListing({ ...src, checkInTimeStart: 15, checkInTimeEnd: 26, checkOutTime: 48 }).listing;
    expect(late.checkin_from).toBe("15:00:00");
    expect(late.checkin_to).toBe("02:00:00");
    expect(late.checkout_by).toBeNull();
    expect(mapListing({ ...src, checkInTimeStart: null }).listing.checkin_from).toBeNull();
  });

  it("keeps sensitive fields out of the listing row", () => {
    const serialised = JSON.stringify(listing);
    expect(serialised).not.toContain("REDACTED-IN-FIXTURE");
    expect(access.door_code).toBe("REDACTED-IN-FIXTURE");
  });

  it("produces a stable content hash that changes with content", () => {
    const again = mapListing(src).listing.content_hash;
    expect(again).toBe(listing.content_hash);
    const changed = mapListing({ ...src, name: `${src.name}!` }).listing.content_hash;
    expect(changed).not.toBe(listing.content_hash);
  });

  it("sanitises HTML", () => {
    const evil = mapListing({ ...src, description: '<p onclick="x()">Hi</p><script>alert(1)</script>' }).listing;
    expect(evil.description_html).toBe("<p>Hi</p>");
  });

  it("orders images and collects amenity ids", () => {
    expect(listing.images.every((i, idx) => typeof i.sort_order === "number" && i.url && idx >= 0)).toBe(true);
    expect(listing.amenity_ids.every((n) => Number.isInteger(n))).toBe(true);
  });
});

describe("mapCalendarDay", () => {
  it("maps Hostaway 0/1 flags and keeps null prices null (§6.6.2)", () => {
    const d = mapCalendarDay(
      HostawayCalendarDay.parse({
        date: "2026-11-10",
        status: "available",
        isAvailable: 1,
        price: 310.5,
        minimumStay: 3,
        closedOnArrival: 0,
        closedOnDeparture: 1,
        reservations: [{ id: 123, channelId: 2000 }],
      }),
    );
    expect(d).toEqual({
      date: "2026-11-10",
      status: "available",
      isAvailable: true,
      allotment: null,
      priceCents: 31050,
      minStay: 3,
      closedOnArrival: false,
      closedOnDeparture: true,
      reservationRef: "123:2000",
    });
    const unknown = mapCalendarDay(HostawayCalendarDay.parse({ date: "2026-11-11", status: "weird", price: null }));
    expect(unknown.status).toBe("unknown");
    expect(unknown.priceCents).toBeNull();
    expect(unknown.reservationRef).toBeNull();
  });
});
