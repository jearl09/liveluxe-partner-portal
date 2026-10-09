import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui class merger. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Render a UTC timestamp in the viewer's timezone with an explicit label —
 * "14 Sep 2026, 4:12 pm AEST". Never render a bare date without a timezone (§10.3, §13.5).
 */
export function formatTimestamp(iso: string, timeZone = "Australia/Melbourne", locale = "en-AU"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(new Date(iso));
}

/** Property-local calendar date → "12 Nov", for lists and ranges where the year is already clear from context. */
export function formatDayMonth(isoDate: string, locale = "en-AU"): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Property-local calendar date → "Thu 12 Nov 2026" (no comma after the weekday, whichever ICU build renders it). */
export function formatDate(isoDate: string, locale = "en-AU"): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(/^(\w+),/, "$1");
}
