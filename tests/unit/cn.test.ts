import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn knows the design-system scales", () => {
  it("keeps a token font size and a text colour together", () => {
    expect(cn("text-on-gold", "text-body-sm")).toBe("text-on-gold text-body-sm");
    expect(cn("text-body", "text-text-primary")).toBe("text-body text-text-primary");
  });
  it("still resolves two font sizes or two radii to the last one", () => {
    expect(cn("text-body", "text-body-sm")).toBe("text-body-sm");
    expect(cn("rounded-control", "rounded-card")).toBe("rounded-card");
  });
});
