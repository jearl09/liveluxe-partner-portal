import { describe, expect, it } from "vitest";
import { displayName, nameFromEmail } from "@/lib/domain/display-name";

describe("nameFromEmail", () => {
  it("capitalises the local part", () => {
    expect(nameFromEmail("claudia@liveluxeau.com")).toBe("Claudia");
  });
  it("splits on dots, dashes and underscores and drops digits and +tags", () => {
    expect(nameFromEmail("ops.test@liveluxeau.com")).toBe("Ops Test");
    expect(nameFromEmail("mary-jane_lee@x.com")).toBe("Mary Jane Lee");
    expect(nameFromEmail("john17+finance@gmail.com")).toBe("John");
  });
  it("returns null when nothing usable is left", () => {
    expect(nameFromEmail(null)).toBeNull();
    expect(nameFromEmail("123@x.com")).toBeNull();
  });
});

describe("displayName", () => {
  it("prefers the stored full name", () => {
    expect(displayName("Claudia Reyes", "claudia@liveluxeau.com")).toBe("Claudia Reyes");
  });
  it("falls back to the email when the name is empty", () => {
    expect(displayName("  ", "claudia@liveluxeau.com")).toBe("Claudia");
    expect(displayName(null, "claudia@liveluxeau.com")).toBe("Claudia");
  });
});
