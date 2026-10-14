import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Class merger that knows the design system's own scales (app/globals.css). Without
 * this, tailwind-merge reads `text-body-sm` as a colour and drops `text-on-gold`, or
 * reads `rounded-control` as unknown and keeps two radii.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "display-sm", "h1", "h2", "h3", "body", "body-sm", "eyebrow"],
      radius: ["control", "card", "pill"],
    },
  },
});

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
