import { describe, expect, it } from "vitest";
import { displayPropertyName, partnerPropertyName, staffPropertyName, streetName } from "@/lib/domain/property-name";

describe("displayPropertyName (brief §7.3)", () => {
  it("drops the unit list in brackets", () => {
    expect(displayPropertyName("673 La Trobe Street Docklands - 2BR Deluxe (1403, 2002)")).toBe(
      "673 La Trobe Street Docklands - 2BR Deluxe",
    );
    expect(displayPropertyName("2BR Standard (1010)")).toBe("2BR Standard");
    expect(displayPropertyName("Loft (12A, 14B), Docklands")).toBe("Loft, Docklands");
  });
  it("drops a channel prefix", () => {
    expect(displayPropertyName("Live Luxe | 13 Werder Street")).toBe("13 Werder Street");
    expect(displayPropertyName("LiveLuxe - Box Hill")).toBe("Box Hill");
  });
  it("keeps words in brackets and never returns empty", () => {
    expect(displayPropertyName("Penthouse (river view)")).toBe("Penthouse (river view)");
    expect(displayPropertyName("(1403)")).toBe("(1403)");
    expect(displayPropertyName(null)).toBe("Property");
  });
});

describe("partner property names: the street, never a unit or a marketing title", () => {
  it("takes the street from the internal name", () => {
    expect(streetName("[BLUEMO] 2913/350 William Street - [Airbnb + BDC]")).toBe("350 William Street");
    expect(streetName("[BLUEMO] [BDC] 1605/442 Elizabeth Street Melbourne - [MEGA - Only]")).toBe(
      "442 Elizabeth Street",
    );
    expect(streetName("[DISCARDED] 6507/462 Elizabeth St")).toBe("462 Elizabeth Street");
    expect(streetName("1213/43 Therry Street - [Airbnb + BDC]")).toBe("43 Therry Street");
    expect(streetName("1A Tarver Street Port Melbourne - [Airbnb + BDC]")).toBe("1A Tarver Street");
    expect(streetName("[DISCARDED] 8701/7 Riverside Quay")).toBe("7 Riverside Quay");
    expect(streetName("4602/45 Clarke Street Southbank")).toBe("45 Clarke Street");
    expect(streetName("6201/135 A'Beckett Street Melbourne")).toBe("135 A'Beckett Street");
    expect(streetName("232-242 Rouse St, Port Melbourne")).toBe("232-242 Rouse Street");
    expect(streetName("North Port Hotel, 146 Evans St")).toBe("146 Evans Street");
  });
  it("returns null when the internal name has no street", () => {
    expect(streetName("Studio at QV")).toBeNull();
    expect(streetName(null)).toBeNull();
  });
  it("prefers the street, else cleans the public name, dropping a leading unit", () => {
    expect(
      partnerPropertyName(
        "Breathtaking Views | Spacious Apartment at Flagstaff Gardens",
        "[BLUEMO] 2913/350 William Street",
      ),
    ).toBe("350 William Street");
    expect(partnerPropertyName("Cozy & Central 1B Studio at QV Market", null)).toBe(
      "Cozy & Central 1B Studio at QV Market",
    );
    expect(partnerPropertyName("1311/677 La Trobe Street Docklands", null)).toBe("677 La Trobe Street Docklands");
  });
});

describe("staff property names: the internal street name with its unit, no tags", () => {
  it("drops owner and channel tags but keeps the unit", () => {
    expect(staffPropertyName("x", "[BLUEMO][BRYAN] 713/628 Flinders Street - [Airbnb + BDC]")).toBe(
      "713/628 Flinders Street",
    );
    expect(
      staffPropertyName(
        "x",
        "[BLUEMO] [BDC] 677 La Trobe Street Docklands - 2BR Standard (602, 1113) - [MEGA - Multi]",
      ),
    ).toBe("677 La Trobe Street Docklands - 2BR Standard (602, 1113)");
    expect(staffPropertyName("Cozy Studio", null)).toBe("Cozy Studio");
  });
});
