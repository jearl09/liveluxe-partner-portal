import { describe, expect, it } from "vitest";
import { amenityFacts, curateAmenities, groupAmenities } from "@/lib/domain/amenities";

describe("amenities (brief §7.4)", () => {
  const raw = [
    "Internet",
    "Wireless",
    "Toilet",
    "Body soap",
    "Elevator",
    "Kitchen",
    "Paid parking on premises",
    "Washing Machine",
    "Mystery thing",
    null,
  ];
  it("merges, renames and drops noise", () => {
    const c = curateAmenities(raw);
    expect(c.map((x) => x.label)).toEqual([
      "Wi-Fi",
      "Lift",
      "Full kitchen",
      "Paid parking on site",
      "Washing machine",
      "Mystery thing",
    ]);
  });
  it("groups in the brief's order, empty groups left out", () => {
    const g = groupAmenities(curateAmenities(raw));
    expect(g.map((x) => x.group)).toEqual(["Essentials", "Kitchen", "Laundry", "Comfort"]);
    expect(g[0]!.items).toEqual(["Wi-Fi", "Lift", "Paid parking on site"]);
  });
  it("derives the at-a-glance facts", () => {
    expect(amenityFacts(curateAmenities(raw))).toEqual({
      parking: "Paid parking on site",
      lift: true,
      accessible: false,
      workspace: false,
    });
    expect(amenityFacts(curateAmenities(["Wheelchair access possible"])).accessible).toBe(true);
  });
});
