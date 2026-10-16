/**
 * The name a partner sees for a property (brief §7.3): the street-style name only, never a unit number before
 * approval and never a channel's marketing title. Pure.
 *
 * Live Luxe's internal Hostaway name carries the street ("[BLUEMO] 2913/350 William Street - [Airbnb + BDC]"); the
 * public name is often an Airbnb title ("Breathtaking Views | Spacious Apartment at Flagstaff Gardens"). The street
 * wins when there is one; otherwise the public name is cleaned.
 */

/** Street types as written in the listings, with the long form shown to partners. */
const STREET_TYPES: Record<string, string> = {
  street: "Street",
  st: "Street",
  road: "Road",
  rd: "Road",
  drive: "Drive",
  dr: "Drive",
  lane: "Lane",
  ln: "Lane",
  avenue: "Avenue",
  ave: "Avenue",
  place: "Place",
  pl: "Place",
  boulevard: "Boulevard",
  blvd: "Boulevard",
  circuit: "Circuit",
  cct: "Circuit",
  parade: "Parade",
  pde: "Parade",
  quay: "Quay",
  way: "Way",
  court: "Court",
  ct: "Court",
  crescent: "Crescent",
  cres: "Crescent",
  terrace: "Terrace",
  tce: "Terrace",
  highway: "Highway",
  hwy: "Highway",
  close: "Close",
  grove: "Grove",
  walk: "Walk",
  square: "Square",
};

const STREET = new RegExp(
  // Optional unit ("2913/", "12A/"), then the building number ("350", "1A", "232-242"), the street name, its type.
  String.raw`(?:\b\d+[A-Za-z]?\s*/\s*)?\b(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s+((?:[A-Za-z'][A-Za-z'.-]*\s+){1,4}?)(${Object.keys(STREET_TYPES).join("|")})\b\.?`,
  "i",
);

/** "350 William Street" from an internal name, or null when it holds no street address. */
export function streetName(internal: string | null | undefined): string | null {
  const cleaned = (internal ?? "")
    .replace(/\[[^\]]*\]/g, " ") // owner and channel tags: [BLUEMO], [Airbnb + BDC]
    .replace(/\s+/g, " ");
  const m = STREET.exec(cleaned);
  if (!m) return null;
  const words = m[2]!.trim().replace(/\s+/g, " ");
  return `${m[1]} ${words} ${STREET_TYPES[m[3]!.toLowerCase()]}`;
}

export function displayPropertyName(name: string | null | undefined): string {
  let n = (name ?? "").trim();
  n = n.replace(/^live\s*luxe\s*[|:–—-]\s*/i, "");
  // "(1403, 2002)", "(1010)", "(12A, 14B)": unit numbers only, anywhere in the name.
  n = n.replace(/\s*\((?:\s*\d+[A-Za-z]?\s*[,/&]?)+\)/g, "");
  // "1311/677 La Trobe Street": the unit before the building number.
  n = n.replace(/^\d+[A-Za-z]?\s*\/\s*(?=\d)/, "");
  n = n
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
  return n || (name ?? "").trim() || "Property";
}

/** The partner-facing name: the street from the internal name when it has one, else the cleaned public name. */
export function partnerPropertyName(publicName: string | null | undefined, internalName?: string | null): string {
  return streetName(internalName) ?? displayPropertyName(publicName);
}
