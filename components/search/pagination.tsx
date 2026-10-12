import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Previous / next links; the page number lives in the URL like every other filter. */
export function Pagination({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  if (pages <= 1) return null;
  const link = buttonVariants({ variant: "outline", size: "sm" });
  const disabled = "pointer-events-none opacity-40";
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between">
      <Link href={hrefFor(page - 1)} className={cn(link, page <= 1 && disabled)} aria-disabled={page <= 1}>
        <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
      </Link>
      <p className="text-muted-foreground text-sm">
        Page {page} of {pages}
      </p>
      <Link href={hrefFor(page + 1)} className={cn(link, page >= pages && disabled)} aria-disabled={page >= pages}>
        Next <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </nav>
  );
}
