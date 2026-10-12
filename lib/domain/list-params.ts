/**
 * Filters and paging for the request lists (ops queue, ops bookings, partner
 * requests). Everything lives in the URL so a filtered view is shareable and the
 * Back button works; this module parses it, keeps it within bounds and prints it back.
 * Pure: no Next, no Supabase.
 */
import type { SlaBand } from "./requests";
import { isUuid } from "./ids";

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;
export const MAX_SEARCH_LENGTH = 80;

/** Bands an operator can filter the queue by ("none" is not a thing anyone looks for). */
export const FILTERABLE_BANDS = ["breached", "at_risk", "on_track", "paused"] as const satisfies readonly SlaBand[];
export type FilterableBand = (typeof FILTERABLE_BANDS)[number];

export interface ListParams {
  /** SLA band (queue only). */
  band: FilterableBand | null;
  /** Partner organisation. */
  orgId: string | null;
  /** Free text matched against the reference and the guest name. */
  q: string;
  page: number;
  pageSize: PageSize;
}

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Reads the list parameters off `searchParams`, discarding anything malformed. */
export function parseListParams(sp: Raw): ListParams {
  const band = first(sp.band);
  const orgId = first(sp.orgId);
  const q = first(sp.q).trim().slice(0, MAX_SEARCH_LENGTH);
  const page = Number.parseInt(first(sp.page), 10);
  const size = Number.parseInt(first(sp.pageSize), 10);
  return {
    band: (FILTERABLE_BANDS as readonly string[]).includes(band) ? (band as FilterableBand) : null,
    orgId: isUuid(orgId) ? orgId : null,
    q,
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? (size as PageSize) : DEFAULT_PAGE_SIZE,
  };
}

/**
 * Prints parameters back into a query string, omitting defaults so the plain URL
 * stays plain. `extra` carries a page's own keys (a status or a tab) through unchanged.
 */
export function listQueryString(p: Partial<ListParams>, extra: Record<string, string | undefined> = {}): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) if (v) out.set(k, v);
  if (p.band) out.set("band", p.band);
  if (p.orgId) out.set("orgId", p.orgId);
  if (p.q) out.set("q", p.q);
  if (p.pageSize && p.pageSize !== DEFAULT_PAGE_SIZE) out.set("pageSize", String(p.pageSize));
  if (p.page && p.page > 1) out.set("page", String(p.page));
  const s = out.toString();
  return s ? `?${s}` : "";
}

export function hasActiveFilters(p: ListParams): boolean {
  return !!(p.band || p.orgId || p.q);
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: PageSize;
  pages: number;
  /** 1-based positions of the first and last row shown; both 0 when empty. */
  from: number;
  to: number;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Clamps a requested page to what exists, so `?page=99` lands on the last page rather than an empty one. */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, page), pageCount(total, pageSize));
}

/** Zero-based row window for a page: PostgREST `.range(from, to)` is inclusive at both ends. */
export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

/** Builds the page envelope from a total and the rows for the current window. */
export function toPage<T>(rows: T[], total: number, page: number, pageSize: PageSize): Page<T> {
  const pages = pageCount(total, pageSize);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(total, from + rows.length - 1);
  return { rows, total, page, pageSize, pages, from, to };
}

/** In-memory paging for lists small enough to hold whole (the active queue). */
export function paginate<T>(all: T[], page: number, pageSize: PageSize): Page<T> {
  const p = clampPage(page, all.length, pageSize);
  const { from, to } = pageRange(p, pageSize);
  return toPage(all.slice(from, to + 1), all.length, p, pageSize);
}

/**
 * Escapes a search term for a PostgREST `ilike` pattern inside an `.or()` filter:
 * the pattern's own wildcards and the characters that would split the filter list.
 */
export function ilikePattern(q: string): string {
  const cleaned = q.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()"]/g, " ");
  return `%${cleaned.trim()}%`;
}
