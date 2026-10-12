import { describe, it, expect } from "vitest";
import {
  htmlToText,
  parseDescription,
  parseHouseRules,
  splitSectionHeading,
  stripPresentation,
} from "@/lib/domain/listing-content";

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

// Verbatim shape of a real Hostaway description: one paragraph, decorative markers.
const QV_MARKET =
  '<p><span style="color:#b7853a;font-family:Georgia">Cozy 1 bedroom apartment in the heart of Melbourne, steps from the ' +
  "renowned Queen Victoria Market. Perfect for short stays with everything you need right at your doorstep. Live with " +
  "Luxe on this stay. ╰┈➤ Living Room Kick back and relax in the cozy living space featuring a mounted TV with access " +
  "to all major streaming platforms. You're welcome to log in to your own Netflix, Disney+, or Stan accounts. Enjoy a " +
  "chill night in on the comfy couch, with air conditioning keeping the space cool. ╰┈➤ Kitchen Whether you're cooking " +
  "up a quick breakfast or a full dinner, the kitchen's got you covered. It comes fully equipped with: ➤ Oven &amp; stove " +
  "➤ Microwave ➤ Fridge ➤ Espresso coffee maker ➤ Kettle, toaster &amp; rice cooker ╰┈➤ Bedroom Ensuring that you will " +
  "have a restful sleep ➤ Queen sized bed ➤ In-built wardrobe &amp; hangers ➤ Iron and ironing ╰┈➤ Dining Share a meal " +
  "or get some work done at the stylish dining table for two— perfect for a quiet dinner. ╰┈➤ Bathroom Enjoy the " +
  "convenience of a private bathroom, featuring: ➤ Refreshing showers ➤ Hair dryer provided ╰┈➤ Laundry Longer stay? " +
  "No problem. You'll have access to: ➤ Washing machine &amp; dryer which is located inside the unit. ➤ Drying rack " +
  "╰┈➤ Parking Please note: Parking is not included with this property. However, nearby paid public car parks and paid " +
  "street parking options are available if needed. You'll have full private access to the entire apartment during your " +
  "stay. Check-in is simple and flexible, and we're always just a message away if you need anything! ➤ Prime location " +
  "in Melbourne CBD ➤ Short walk to Melbourne Central Station ➤ Close to Queen Victoria Market</span></p>";

describe("stripPresentation", () => {
  it("drops colours and faces but keeps the markup", () => {
    expect(stripPresentation('<p><span style="color:#b7853a">Hi</span></p>')).toBe("<p><span>Hi</span></p>");
    expect(stripPresentation("<font color=red face='Arial'>Hi</font>")).toBe("<font>Hi</font>");
    expect(stripPresentation('<p class="x" id="keep">Hi</p>')).toBe('<p id="keep">Hi</p>');
    // Text that merely looks like an attribute is left alone.
    expect(stripPresentation("<p>style=loud and color=blue</p>")).toBe("<p>style=loud and color=blue</p>");
  });
});

describe("splitSectionHeading", () => {
  it("takes a known section name even when the body opens with its own colon", () => {
    expect(splitSectionHeading("Parking Please note: Parking is not included.")).toEqual({
      heading: "Parking",
      rest: "Please note: Parking is not included.",
    });
    expect(splitSectionHeading("Kitchen: fully equipped")).toEqual({ heading: "Kitchen", rest: "fully equipped" });
    expect(splitSectionHeading("Living Room Kick back and relax.")).toEqual({
      heading: "Living Room",
      rest: "Kick back and relax.",
    });
  });

  it("falls back to an explicit colon, then to the shape of the sentence", () => {
    expect(splitSectionHeading("Wine Cellar: a cool surprise")).toEqual({
      heading: "Wine Cellar",
      rest: "a cool surprise",
    });
    // Unknown name, no colon: the body starts a sentence, so "Enjoy" is not part of it.
    expect(splitSectionHeading("Cinema Snug Enjoy a film in here.")).toEqual({
      heading: "Cinema Snug",
      rest: "Enjoy a film in here.",
    });
    // Nothing heading-shaped at all.
    expect(splitSectionHeading("and then some more prose")).toEqual({
      heading: null,
      rest: "and then some more prose",
    });
  });
});

describe("parseDescription (§13.3)", () => {
  it("recovers every section, its prose and its list, without changing a word", () => {
    const view = parseDescription(QV_MARKET);
    expect(view?.kind).toBe("blocks");
    if (view?.kind !== "blocks") return;

    expect(view.intro).toBe(
      "Cozy 1 bedroom apartment in the heart of Melbourne, steps from the renowned Queen Victoria Market. " +
        "Perfect for short stays with everything you need right at your doorstep. Live with Luxe on this stay.",
    );
    expect(view.blocks.map((b) => b.heading)).toEqual([
      "Living Room",
      "Kitchen",
      "Bedroom",
      "Dining",
      "Bathroom",
      "Laundry",
      "Parking",
      // The location list trails a parking paragraph that plainly does not introduce it.
      null,
    ]);

    const kitchen = view.blocks[1];
    expect(kitchen.paragraphs).toEqual([
      "Whether you're cooking up a quick breakfast or a full dinner, the kitchen's got you covered. " +
        "It comes fully equipped with:",
    ]);
    expect(kitchen.items).toEqual([
      "Oven & stove",
      "Microwave",
      "Fridge",
      "Espresso coffee maker",
      "Kettle, toaster & rice cooker",
    ]);

    // A short lead-in with no colon still owns the list that follows it.
    expect(view.blocks[2]).toEqual({
      heading: "Bedroom",
      paragraphs: ["Ensuring that you will have a restful sleep"],
      items: ["Queen sized bed", "In-built wardrobe & hangers", "Iron and ironing"],
    });

    // Prose-only section keeps its prose and gains no list.
    expect(view.blocks[3].items).toEqual([]);
    expect(view.blocks[3].paragraphs[0]).toMatch(/^Share a meal/);

    // Parking keeps its own prose; the location bullets stand apart.
    expect(view.blocks[6].items).toEqual([]);
    expect(view.blocks[6].paragraphs[0]).toMatch(/^Please note: Parking is not included/);
    expect(view.blocks[7]).toEqual({
      heading: null,
      paragraphs: [],
      items: [
        "Prime location in Melbourne CBD",
        "Short walk to Melbourne Central Station",
        "Close to Queen Victoria Market",
      ],
    });

    // Nothing is dropped: every word of the source survives somewhere.
    const rendered = [view.intro, ...view.blocks.flatMap((b) => [b.heading, ...b.paragraphs, ...b.items])].join(" ");
    for (const word of htmlToText(QV_MARKET).split(/\s+/)) {
      if (/^[╰┈➤]+$/.test(word)) continue;
      expect(rendered).toContain(word);
    }
  });

  it("leaves prose and real HTML lists alone, minus their inline styling", () => {
    expect(parseDescription("<p>A quiet two-bedroom near the bay.</p>")).toEqual({
      kind: "html",
      html: "<p>A quiet two-bedroom near the bay.</p>",
    });
    expect(parseDescription('<ul style="color:red"><li>One</li><li>Two</li></ul>')).toEqual({
      kind: "html",
      html: "<ul><li>One</li><li>Two</li></ul>",
    });
    // One lone marker is not structure worth rebuilding.
    expect(parseDescription("<p>A quiet flat ➤ with a view</p>")?.kind).toBe("html");
  });

  it("handles a list with no sections at all", () => {
    const view = parseDescription("<p>Close to everything: ➤ Trams ➤ Trains ➤ Cafes</p>");
    expect(view).toEqual({
      kind: "blocks",
      intro: "Close to everything:",
      blocks: [{ heading: null, paragraphs: [], items: ["Trams", "Trains", "Cafes"] }],
    });
  });

  it("returns null for empty content", () => {
    expect(parseDescription(null)).toBeNull();
    expect(parseDescription("<p> </p>")).toBeNull();
  });
});
