import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Previous / next links; the page number lives in the URL like every other filter. */
export function Pagination({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  if (pages <= 1) return null;
  const link =
    "border-cream-300 text-navy-900 inline-flex h-9 items-center gap-1 rounded-md border bg-white px-3 text-sm hover:bg-cream-50";
  const disabled = "pointer-events-none opacity-40";
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between">
      <Link href={hrefFor(page - 1)} className={cn(link, page <= 1 && disabled)} aria-disabled={page <= 1}>
        <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
      </Link>
      <p className="text-ink-500 text-sm">
        Page {page} of {pages}
      </p>
      <Link href={hrefFor(page + 1)} className={cn(link, page >= pages && disabled)} aria-disabled={page >= pages}>
        Next <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </nav>
  );
}
