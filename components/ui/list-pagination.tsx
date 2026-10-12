import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PAGE_SIZES, type Page } from "@/lib/domain/list-params";
import { cn } from "@/lib/utils";

/**
 * Footer for a paged list: what is showing, previous / next, and the page size.
 * Everything is a link — the page and the size live in the URL with the filters,
 * so Back works and a view can be shared.
 */
export function ListPagination({
  page,
  noun,
  hrefFor,
  sizeHrefFor,
}: {
  page: Page<unknown>;
  /** Singular noun for the count, e.g. "request". */
  noun: string;
  hrefFor: (page: number) => string;
  sizeHrefFor: (size: number) => string;
}) {
  const { total, pages, from, to, pageSize } = page;
  if (total === 0) return null;
  const link = buttonVariants({ variant: "outline", size: "sm" });
  const disabled = "pointer-events-none opacity-40";
  return (
    <nav
      aria-label={`${noun[0]?.toUpperCase()}${noun.slice(1)} pages`}
      className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm"
    >
      <p>
        Showing{" "}
        <span className="text-strong tabular-nums">
          {from}–{to}
        </span>{" "}
        of <span className="text-strong tabular-nums">{total}</span> {total === 1 ? noun : `${noun}s`}
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {total > PAGE_SIZES[0] && (
          <p className="flex items-center gap-1.5 text-xs">
            <span>Per page</span>
            {PAGE_SIZES.map((size) => (
              <Link
                key={size}
                href={sizeHrefFor(size)}
                aria-current={size === pageSize ? "true" : undefined}
                className={cn(
                  "focus-visible:ring-ring rounded-md px-1.5 py-1 tabular-nums focus-visible:ring-2 focus-visible:outline-none",
                  size === pageSize ? "text-strong bg-muted font-medium" : "hover:text-strong",
                )}
              >
                {size}
              </Link>
            ))}
          </p>
        )}
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <Link
              href={hrefFor(page.page - 1)}
              className={cn(link, page.page <= 1 && disabled)}
              aria-disabled={page.page <= 1}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
            </Link>
            <span className="tabular-nums">
              Page {page.page} of {pages}
            </span>
            <Link
              href={hrefFor(page.page + 1)}
              className={cn(link, page.page >= pages && disabled)}
              aria-disabled={page.page >= pages}
            >
              Next <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
