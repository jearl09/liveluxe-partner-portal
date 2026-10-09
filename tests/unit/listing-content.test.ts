import { describe, it, expect } from "vitest";
import { htmlToText, parseHouseRules } from "@/lib/domain/listing-content";

// Verbatim shape of a real Hostaway houseRules field: one paragraph, inline numbering.
const HOSTAWAY_RULES =
  "<p>We are thrilled to have you as our esteemed guest. To ensure a harmonious and enjoyable stay for all, " +
  "we kindly request that you adhere to the following house rules: 1. Respect the property. Any damage caused " +
  "to the property or its contents will be the responsibility of the guest. 2. No smoking indoors - a fine of " +
  "$200 is applicable plus the cost to clean, deodorize, and repair damages. 3. Ensure minimal noise within the " +
  "property and common areas from 11pm to 7am. 4. Please adhere to the maximum occupancy limit specified for the " +
  "accommodation. Overcrowding is not permitted. 5. No parties or events. 6. Please help us maintain cleanliness " +
  "by tidying up after yourself and using the provided trash bins. 7. Keys &amp; Key Responsibility: One set of " +
  "keys is provided as standard. A second set may be available upon request, subject to availability, and " +
  "requires a $250 refundable security deposit. 8. After-Hours Call-Out Fee: A $150 call-out fee applies to any " +
  "non-emergency maintenance attendance requested after 5:00 PM.</p>";

describe("htmlToText", () => {
  it("turns block boundaries into newlines, strips tags and decodes entities", () => {
    expect(htmlToText("<p>One &amp; two</p><p>Three<br>Four</p>")).toBe("One & two\nThree\nFour");
    expect(htmlToText("A&nbsp;B &#8211; C &#x2014; D &lt;b&gt;")).toBe("A B – C — D <b>");
    expect(htmlToText("  <div> spaced   out </div>  ")).toBe("spaced out");
  });
});

describe("parseHouseRules (§13.3)", () => {
  it("splits inline numbering into intro and rules, keeping every word", () => {
    const view = parseHouseRules(HOSTAWAY_RULES);
    expect(view?.kind).toBe("list");
    if (view?.kind !== "list") return;
    expect(view.intro).toBe(
      "We are thrilled to have you as our esteemed guest. To ensure a harmonious and enjoyable stay for all, " +
        "we kindly request that you adhere to the following house rules:",
    );
    expect(view.rules).toHaveLength(8);
    expect(view.rules[0]).toEqual({
      label: null,
      text: "Respect the property. Any damage caused to the property or its contents will be the responsibility of the guest.",
    });
    expect(view.rules[1].text).toMatch(/^No smoking indoors - a fine of \$200/);
    expect(view.rules[4]).toEqual({ label: null, text: "No parties or events." });
    // "Subject: detail" rules get a label; the entity is decoded.
    expect(view.rules[6].label).toBe("Keys & Key Responsibility");
    expect(view.rules[6].text).toMatch(/^One set of keys is provided as standard\./);
    expect(view.rules[7]).toEqual({
      label: "After-Hours Call-Out Fee",
      text: "A $150 call-out fee applies to any non-emergency maintenance attendance requested after 5:00 PM.",
    });
    // Nothing lost: every word of the source survives in intro + rules.
    const joined = [view.intro, ...view.rules.map((r) => (r.label ? `${r.label}: ${r.text}` : r.text))].join(" ");
    for (const word of htmlToText(HOSTAWAY_RULES)
      .replace(/\s\d\.\s/g, " ")
      .split(" ")) {
      expect(joined).toContain(word);
    }
  });

  it("accepts '1)' markers and numbering that starts at the top", () => {
    const view = parseHouseRules("1) No smoking. 2) No pets. 3) Quiet after 10pm.");
    expect(view).toEqual({
      kind: "list",
      intro: null,
      rules: [
        { label: null, text: "No smoking." },
        { label: null, text: "No pets." },
        { label: null, text: "Quiet after 10pm." },
      ],
    });
  });

  it("ignores numbers that are not the next marker in sequence", () => {
    const view = parseHouseRules("Rules: 1. Max 4 guests. 2. Bond is $1.50 per 2. day. 3. Done.");
    expect(view?.kind).toBe("list");
    if (view?.kind !== "list") return;
    // "$1.50" and the out-of-order "2." inside rule 2 do not start new rules.
    expect(view.rules.map((r) => r.text)).toEqual(["Max 4 guests.", "Bond is $1.50 per 2. day.", "Done."]);
  });

  it("leaves a single rule, prose and real HTML lists as HTML", () => {
    expect(parseHouseRules("<p>1. Just one rule.</p>")).toEqual({ kind: "html", html: "<p>1. Just one rule.</p>" });
    expect(parseHouseRules("<p>Please be kind to the neighbours.</p>")?.kind).toBe("html");
    const ol = "<ol><li>One</li><li>Two</li></ol>";
    expect(parseHouseRules(ol)).toEqual({ kind: "html", html: ol });
  });

  it("returns null for empty content", () => {
    expect(parseHouseRules(null)).toBeNull();
    expect(parseHouseRules("")).toBeNull();
    expect(parseHouseRules("<p> </p>")).toBeNull();
  });

  it("does not label a rule whose 'subject' contains sentence punctuation", () => {
    const view = parseHouseRules("1. Check-out is at 10am. Late check-out: ask first. 2. No parties.");
    if (view?.kind !== "list") throw new Error("expected list");
    expect(view.rules[0].label).toBeNull();
  });
});
