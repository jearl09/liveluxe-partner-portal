/**
 * The name shown for a signed-in person when no full name is stored: taken from the email's
 * local part ("claudia@…" → "Claudia", "ops.test@…" → "Ops Test"). Pure.
 */
export function nameFromEmail(email: string | null | undefined): string | null {
  const local = (email ?? "").split("@")[0]!.split("+")[0]!;
  const words = local
    .split(/[._-]+/)
    .map((w) => w.replace(/\d+/g, ""))
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
  return words.length ? words.join(" ") : null;
}

/** The stored full name when there is one, otherwise the name from the email. */
export function displayName(fullName: string | null | undefined, email: string | null | undefined): string | null {
  return fullName?.trim() || nameFromEmail(email);
}
