import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one table (brief §4.7). A real `<table>` from 768 px up and a card list below,
 * from the same column definitions. Sticky header, sortable columns with an explicit
 * indicator and the default sort stated by the caller, 56 px rows (48 px dense in
 * the ops console), the whole row a link with the identity cell a real `<a>`,
 * numeric columns right-aligned and tabular, status last.
 *
 * Server-component friendly: sorting and paging live in the URL; the caller supplies
 * `sortHref` and the current `sort`, nothing is stateful here.
 */
export type SortDir = "asc" | "desc";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** The identity column: rendered as the row's link and first on a card. Exactly one per table. */
  primary?: boolean;
  align?: "left" | "right";
  /** Right-aligned, tabular figures. */
  numeric?: boolean;
  sortable?: boolean;
  /** Column width hint for the table layout, e.g. "12rem". */
  width?: string;
  /** Label beside the value on a card; defaults to the header when it is a string. */
  cardLabel?: string;
  /** Leave this column out of the card list. */
  hideOnCard?: boolean;
  /** Mark the status column so cards place it top-right beside the identity. */
  status?: boolean;
  /**
   * Leave out of the table below `xl` ("xl") or `2xl` ("2xl"); `true` is kept for older call sites and,
   * now that the table starts at `lg`, always shows. Cards show every column.
   */
  optional?: boolean | "xl" | "2xl";
  /** Leave out of a printed page (row actions). */
  printHidden?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Where the row goes. Omit for tables that are not navigable. */
  rowHref?: (row: T) => string | undefined;
  /** Accessible name for the row link, e.g. "Open request LLX-2026-000005". */
  rowLabel?: (row: T) => string;
  sort?: { key: string; dir: SortDir };
  sortHref?: (key: string, dir: SortDir) => string;
  /** Ops console density: 48 px rows, 13 px text. */
  dense?: boolean;
  /** Visually hidden caption for assistive tech, e.g. "Requests, ordered by decision deadline". */
  caption: string;
  /** Rendered in place of the rows when there are none. */
  empty: ReactNode;
  /** Trailing per-row actions (a kebab or tertiary links), shown on hover and focus. */
  actions?: (row: T) => ReactNode;
  className?: string;
}

const SORT_ICON = { asc: ChevronUp, desc: ChevronDown } as const;

export function DataTable<T>(p: DataTableProps<T>) {
  const primary = p.columns.find((c) => c.primary) ?? p.columns[0];
  const statusCol = p.columns.find((c) => c.status);
  const cardCols = p.columns.filter((c) => c !== primary && c !== statusCol && !c.hideOnCard);
  const rowH = p.dense ? "h-12" : "h-14";
  const text = p.dense ? "text-body-sm" : "text-body";

  if (p.rows.length === 0) return <div className={p.className}>{p.empty}</div>;

  return (
    <div className={p.className}>
      {/* Table from 768 px */}
      {/* Table from 1024 px (brief §10.1: two-column cards below that). The scroll is a safety net:
          a table wider than its card scrolls instead of being clipped by the card. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className={cn("w-full border-collapse text-left", text)}>
          <caption className="sr-only">{p.caption}</caption>
          <thead className="bg-surface sticky top-16 z-10">
            <tr className="border-subtle border-b">
              {p.columns.map((c) => {
                const active = p.sort?.key === c.key;
                const nextDir: SortDir = active && p.sort?.dir === "asc" ? "desc" : "asc";
                const Icon = active ? SORT_ICON[p.sort!.dir] : ChevronsUpDown;
                const content = (
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {c.sortable && p.sortHref && (
                      <Icon
                        className={cn("h-3.5 w-3.5", active ? "text-text-primary" : "text-text-muted")}
                        aria-hidden
                      />
                    )}
                  </span>
                );
                return (
                  <th
                    key={c.key}
                    scope="col"
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={active ? (p.sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "text-text-muted text-body-sm px-3 py-2.5 font-semibold whitespace-nowrap first:pl-5 last:pr-5",
                      (c.numeric || c.align === "right") && "text-right",
                      c.optional === "xl" && "hidden xl:table-cell",
                      c.optional === "2xl" && "hidden 2xl:table-cell",
                      c.printHidden && "print:hidden",
                    )}
                  >
                    {c.sortable && p.sortHref ? (
                      <Link
                        href={p.sortHref(c.key, nextDir)}
                        className="hover:text-text-primary rounded-control focus-visible:outline-focus -mx-1 px-1 focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </th>
                );
              })}
              {p.actions && (
                <th scope="col" className="px-3 py-2.5 last:pr-5">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-subtle divide-y">
            {p.rows.map((row) => {
              const href = p.rowHref?.(row);
              return (
                <tr
                  key={p.rowKey(row)}
                  className={cn(
                    "group relative transition-colors duration-150 ease-out",
                    href && "hover:bg-inset focus-within:bg-inset",
                    rowH,
                  )}
                >
                  {p.columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-3 py-2 align-middle first:pl-5 last:pr-5",
                        (c.numeric || c.align === "right") && "text-right whitespace-nowrap tabular-nums",
                        c.primary && "whitespace-nowrap",
                        c.optional === "xl" && "hidden xl:table-cell",
                        c.optional === "2xl" && "hidden 2xl:table-cell",
                        c.printHidden && "print:hidden",
                      )}
                    >
                      {c === primary && href ? (
                        <Link
                          href={href}
                          aria-label={p.rowLabel?.(row)}
                          className="text-text-primary focus-visible:after:outline-focus after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2"
                        >
                          {c.cell(row)}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                  {p.actions && (
                    <td className="relative z-10 px-3 py-2 text-right align-middle whitespace-nowrap last:pr-5">
                      <span className="coarse:opacity-100 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        {p.actions(row)}
                      </span>
                    </td>
                  )}
                  {href && !p.actions && (
                    <td className="w-8 pr-4 text-right align-middle">
                      <ChevronRight className="text-text-muted inline h-4 w-4" aria-hidden />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Card list below 768 px */}
      <ul className="divide-subtle divide-y lg:hidden" aria-label={p.caption}>
        {p.rows.map((row) => {
          const href = p.rowHref?.(row);
          return (
            <li
              key={p.rowKey(row)}
              className={cn("relative px-4 py-3", href && "hover:bg-inset focus-within:bg-inset")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {href ? (
                    <Link
                      href={href}
                      aria-label={p.rowLabel?.(row)}
                      className="text-text-primary focus-visible:after:outline-focus after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2"
                    >
                      {primary.cell(row)}
                    </Link>
                  ) : (
                    primary.cell(row)
                  )}
                </div>
                {href && <ChevronRight className="text-text-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
              </div>
              {statusCol && <div className="mt-2">{statusCol.cell(row)}</div>}
              {cardCols.length > 0 && (
                <dl className="text-body-sm mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  {cardCols.map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-text-muted">
                        {c.cardLabel ?? (typeof c.header === "string" ? c.header : "")}
                      </dt>
                      <dd className={cn("text-text-secondary min-w-0", c.numeric && "tabular-nums")}>{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {p.actions && <div className="relative z-10 mt-2 flex justify-end gap-2">{p.actions(row)}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
