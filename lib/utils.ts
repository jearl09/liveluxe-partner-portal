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

/**
 * A deadline or event in plain words (brief §13 rule 2): "3:00 pm today", "3:00 pm tomorrow",
 * "Tue 14 Oct, 3:00 pm", always followed by the zone ("AEDT"). Compared in the property's
 * zone, so "today" means today in Melbourne.
 */
export function formatWhen(iso: string, now: Date = new Date(), timeZone = "Australia/Melbourne", locale = "en-AU") {
  const at = new Date(iso);
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone })
    .format(at)
    .replace(/\s?([ap])\.?m\.?$/i, " $1m")
    .toLowerCase();
  const zone =
    new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000));
  const k = dayKey(at);
  const day =
    k === today
      ? "today"
      : k === tomorrow
        ? "tomorrow"
        : new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone })
            .format(at)
            .replace(/^(\w+),/, "$1");
  return k === today || k === tomorrow ? `${time} ${day} ${zone}`.trim() : `${day}, ${time} ${zone}`.trim();
}

/** "3:00 pm" from a Postgres time ("15:00:00"). */
export function formatClock(t: string | null | undefined): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m ?? 0).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
