/**
 * Listing copy that arrives from Hostaway as one block of sanitised HTML — spec §6.6, §13.3.
 *
 * House rules are typed by ops as a single paragraph with inline numbering
 * ("… house rules: 1. Respect the property. 2. No smoking …"). Partners scan them
 * for fines, deposits and quiet hours, so the page renders them as a real list.
 * This module only re-shapes text; it never changes the wording.
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
  if (/<(ol|ul|li)\b/i.test(html)) return { kind: "html", html };

  const text = htmlToText(html);
  if (!text) return null;

  const cuts: { start: number; bodyStart: number }[] = [];
  let expected = 1;
  for (const m of text.matchAll(MARKER)) {
    if (Number(m[2]) !== expected) continue;
    cuts.push({ start: m.index + m[1].length, bodyStart: m.index + m[0].length });
    expected++;
  }
  if (cuts.length < 2) return { kind: "html", html };

  const intro = text.slice(0, cuts[0].start).trim();
  const rules = cuts.map((c, i) => {
    const end = i + 1 < cuts.length ? cuts[i + 1].start : text.length;
    return splitRule(text.slice(c.bodyStart, end).trim());
  });
  return { kind: "list", intro: intro || null, rules };
}
