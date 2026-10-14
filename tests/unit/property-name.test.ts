import { describe, expect, it } from "vitest";
import { displayPropertyName } from "@/lib/domain/property-name";

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
