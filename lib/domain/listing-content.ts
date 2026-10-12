/**
 * Listing copy that arrives from Hostaway as one block of sanitised HTML — spec §6.6, §13.3.
 *
 * Both the description and the house rules are typed into Hostaway as a single
 * paragraph, with structure carried only by decorative characters: "╰┈➤ Kitchen"
 * for a section, "➤ Microwave" for an item, "1. … 2. …" for a numbered rule.
 * Rendered verbatim that is an unreadable wall of text, so this module recovers
 * the structure the author meant. It only re-shapes text; it never changes the
 * wording, and anything it cannot structure falls back to the sanitised HTML.
 */

export interface HouseRule {
  /** Short subject when the rule is written "Subject: detail" (e.g. "After-Hours Call-Out Fee"). */
  label: string | null;
  text: string;
}

export type HouseRulesView =
  /** Numbered rules found in plain text. */
  | { kind: "list"; intro: string | null; rules: HouseRule[] }
  /** Anything else (real HTML lists, free prose): render the sanitised HTML as is. */
  | { kind: "html"; html: string };

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Sanitised HTML → plain text with newlines at block boundaries. Safe only because the input is already sanitised. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === "#") {
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return NAMED_ENTITIES[code.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Copy pasted into Hostaway from a word processor arrives carrying its own colours
 * and faces, which then override the portal's type (§13.5). The sync-time sanitiser
 * now drops every attribute, but rows synced before it was tightened still hold the
 * old markup, so the render strips presentation again rather than wait for a resync.
 */
const PRESENTATION_ATTR = /\s(?:style|class|color|bgcolor|background|face|size)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

export function stripPresentation(html: string): string {
  return html.replace(/<[^>]+>/g, (tag) => tag.replace(PRESENTATION_ATTR, ""));
}

/** "1. ", "2) " … at the start of the text or after whitespace. */
const MARKER = /(^|\s)(\d{1,2})[.)]\s+/g;
/** A short subject before a colon, with no sentence punctuation inside it. */
const LABELLED = /^([^.:!?]{2,48}?):\s+(\S[\s\S]*)$/;

function splitRule(text: string): HouseRule {
  const m = LABELLED.exec(text);
  return m ? { label: m[1].trim(), text: m[2].trim() } : { label: null, text };
}

/**
 * Finds an in-order numbered sequence (1, 2, 3 …) in the text. Needs at least two
 * rules to count as a list; otherwise the HTML is left alone. Markup that is already
 * a list (<ol>, <ul>) is also left alone — it renders fine as HTML.
 */
export function parseHouseRules(html: string | null | undefined): HouseRulesView | null {
  if (!html || !html.trim()) return null;
  if (/<(ol|ul|li)\b/i.test(html)) return { kind: "html", html: stripPresentation(html) };

  const text = htmlToText(html);
  if (!text) return null;

  const cuts: { start: number; bodyStart: number }[] = [];
  let expected = 1;
  for (const m of text.matchAll(MARKER)) {
    if (Number(m[2]) !== expected) continue;
    cuts.push({ start: m.index + m[1].length, bodyStart: m.index + m[0].length });
    expected++;
  }
  if (cuts.length < 2) return { kind: "html", html: stripPresentation(html) };

  const intro = text.slice(0, cuts[0].start).trim();
  const rules = cuts.map((c, i) => {
    const end = i + 1 < cuts.length ? cuts[i + 1].start : text.length;
    return splitRule(text.slice(c.bodyStart, end).trim());
  });
  return { kind: "list", intro: intro || null, rules };
}

// ---------------------------------------------------------------------------
// Description (§13.3) — "╰┈➤ Kitchen … ➤ Oven & stove ➤ Microwave …"
// ---------------------------------------------------------------------------

export interface DescriptionBlock {
  /** Section name as the author wrote it ("Kitchen"), or null for a run with no heading. */
  heading: string | null;
  paragraphs: string[];
  items: string[];
}

export type DescriptionView =
  /** Structure recovered from the decorative markers. */
  | { kind: "blocks"; intro: string | null; blocks: DescriptionBlock[] }
  /** Plain prose or real HTML markup: render it as is, minus any inline styling. */
  | { kind: "html"; html: string };

/** A corner-and-arrow glyph ("╰┈➤") opens a section; a bare arrow or dot ("➤") marks an item. */
const DESCRIPTION_MARKERS = /([╰╭└┌┗┏][┈┄─━—–·.\s]*[➤➣➢▶►▸→])|([➤➣➢▶►▸•‣⁃◦✔✓★☆✦❖])[ \t]*/gu;

/**
 * Section names these listings actually use. Matching a known name is what keeps
 * "Living Room Kick back and relax…" from splitting in the wrong place; the
 * shape-based fallback below only runs for names this list has not seen.
 */
const SECTION_NAMES = [
  "air conditioning",
  "amenities",
  "arrival",
  "balcony",
  "bathroom",
  "bathrooms",
  "bbq",
  "bedroom",
  "bedrooms",
  "building",
  "building facilities",
  "check in",
  "check-in",
  "check out",
  "check-out",
  "checkout",
  "cooling",
  "courtyard",
  "dining",
  "dining area",
  "dining room",
  "ensuite",
  "entertainment",
  "essentials",
  "extras",
  "facilities",
  "family room",
  "garage",
  "garden",
  "getting around",
  "guest access",
  "gym",
  "heating",
  "house rules",
  "internet",
  "kitchen",
  "kitchenette",
  "laundry",
  "lift",
  "living area",
  "living room",
  "living space",
  "location",
  "lounge",
  "lounge room",
  "main bathroom",
  "main bedroom",
  "master bedroom",
  "nearby",
  "neighborhood",
  "neighbourhood",
  "notes",
  "office",
  "other things to note",
  "outdoor",
  "outdoor area",
  "parking",
  "pets",
  "please note",
  "pool",
  "rooftop",
  "safety",
  "second bedroom",
  "security",
  "smoking",
  "spa",
  "storage",
  "study",
  "terrace",
  "the area",
  "the location",
  "the space",
  "things to note",
  "third bedroom",
  "transport",
  "transportation",
  "wi-fi",
  "wifi",
  "work space",
  "workspace",
].sort((a, b) => b.length - a.length); // longest first: "living room" must beat "living"

const MAX_HEADING = 32;
const TITLE_WORD = /^[A-Z][^\s]*$/;

/**
 * Splits "Kitchen Whether you're cooking…" into its heading and the rest.
 * A known section name wins — it is the only signal that survives a body which
 * itself opens with a colon ("Parking Please note: …"). Failing that, an explicit
 * colon, then the shape of the text: the body starts a new sentence, so the last
 * capitalised word of the opening run belongs to the body, not the heading.
 */
export function splitSectionHeading(content: string): { heading: string | null; rest: string } {
  const text = content.trim();
  if (!text) return { heading: null, rest: "" };

  const lower = text.toLowerCase();
  for (const name of SECTION_NAMES) {
    if (lower.startsWith(name) && /^[\s:—–-]|^$/.test(text.slice(name.length))) {
      return { heading: text.slice(0, name.length), rest: text.slice(name.length).replace(/^[\s:—–-]+/, "") };
    }
  }

  const colon = /^([^.!?\n]{2,32}?):\s+(\S[\s\S]*)$/.exec(text);
  if (colon) return { heading: colon[1].trim(), rest: colon[2] };

  const words = text.split(/\s+/);
  let run = 0;
  while (run < words.length && run < 4 && TITLE_WORD.test(words[run])) run++;
  if (run === 0) return { heading: null, rest: text };
  // Two or more capitalised words followed by lower case: the last one started the body.
  if (run >= 2 && run < words.length && /^[a-z]/.test(words[run])) run--;
  const heading = words.slice(0, run).join(" ");
  if (heading.length > MAX_HEADING) return { heading: null, rest: text };
  return { heading, rest: words.slice(run).join(" ") };
}

const paragraphsOf = (text: string): string[] =>
  text
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

/** A list belongs to the text that introduces it: one ending in a colon, or a short lead-in. */
const introducesList = (paragraphs: string[]): boolean => {
  const last = paragraphs[paragraphs.length - 1];
  return !last || last.endsWith(":") || last.length <= 120;
};

/**
 * Recovers sections and lists from a Hostaway description. Needs at least two
 * markers to be worth restructuring; plain prose is left as HTML so nothing is
 * invented for listings whose copy has no structure to find.
 */
export function parseDescription(html: string | null | undefined): DescriptionView | null {
  if (!html || !html.trim()) return null;
  const clean = stripPresentation(html);
  if (/<(ol|ul|li)\b/i.test(html)) return { kind: "html", html: clean };

  const text = htmlToText(html);
  if (!text) return null;

  const marks = [...text.matchAll(DESCRIPTION_MARKERS)];
  if (marks.length < 2) return { kind: "html", html: clean };

  const intro = text.slice(0, marks[0].index).trim();
  const blocks: DescriptionBlock[] = [];
  let current: DescriptionBlock | null = null;

  for (const [i, m] of marks.entries()) {
    const body = text.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : text.length).trim();
    if (!body) continue;

    if (m[1]) {
      // Section marker: everything until the next marker belongs to this heading.
      const { heading, rest } = splitSectionHeading(body);
      current = { heading, paragraphs: paragraphsOf(rest), items: [] };
      blocks.push(current);
      continue;
    }

    // Item marker. Start a new unheaded run when the section has moved on to prose
    // that plainly is not a lead-in — the location list after a parking paragraph.
    if (!current || (current.items.length === 0 && !introducesList(current.paragraphs))) {
      current = { heading: null, paragraphs: [], items: [] };
      blocks.push(current);
    }
    current.items.push(body.replace(/\s*\n\s*/g, " "));
  }

  if (blocks.length === 0) return { kind: "html", html: clean };
  return { kind: "blocks", intro: intro || null, blocks };
}
