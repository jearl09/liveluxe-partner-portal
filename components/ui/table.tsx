import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Data table inside a flush `Panel`. Narrow screens scroll the table sideways instead
 * of crushing its columns; a table that would rather become a list on a phone (the
 * requests table does) renders its own list and hides this one.
 */
export function Table({
  className,
  minWidth = "40rem",
  ...rest
}: ComponentPropsWithoutRef<"table"> & { minWidth?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-left text-sm", className)} style={{ minWidth }} {...rest} />
    </div>
  );
}

/** Column-heading row styles, so every table's header reads the same. */
export const theadClass = "text-muted-foreground text-xs tracking-wide uppercase";
export const thClass = "px-3 py-2.5 font-medium first:pl-5 last:pr-5";
export const tdClass = "px-3 py-3 align-top first:pl-5 last:pr-5";
