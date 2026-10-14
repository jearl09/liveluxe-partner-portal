/**
 * The name a partner sees for a property (brief §7.3): the street-style name only.
 * Channel marketing prefixes ("Live Luxe | …") and the internal unit list Hostaway
 * keeps in brackets ("(1403, 2002)") are dropped. Pure.
 */
export function displayPropertyName(name: string | null | undefined): string {
  let n = (name ?? "").trim();
  n = n.replace(/^live\s*luxe\s*[|:–—-]\s*/i, "");
  // "(1403, 2002)", "(1010)", "(12A, 14B)": unit numbers only, anywhere in the name.
  n = n.replace(/\s*\((?:\s*\d+[A-Za-z]?\s*[,/&]?)+\)/g, "");
  n = n
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
  return n || (name ?? "").trim() || "Property";
}
