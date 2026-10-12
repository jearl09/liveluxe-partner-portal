import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one layout for "something is not right" pages: a 404, a recoverable error, an
 * expired link. Quiet, centred, serif title, one or two actions — the same voice as
 * the rest of the portal, so a dead end never looks like a different product.
 * Presentational only, so both server pages (not-found) and client error boundaries
 * can render it.
 */
export function Trouble({
  eyebrow,
  title,
  children,
  actions,
  refCode,
  className,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** Support reference to quote; shown small and monospaced. */
  refCode?: string | null;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn("mx-auto flex w-full max-w-md flex-col items-start py-16 lg:py-24", className)}
    >
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h1 id={headingId} className="text-strong font-serif text-3xl tracking-tight">
        {title}
      </h1>
      <div className="gold-rule my-5" />
      {children && <div className="text-foreground space-y-2 text-sm leading-relaxed">{children}</div>}
      {actions && <div className="mt-6 flex flex-wrap gap-2">{actions}</div>}
      {refCode && (
        <p className="text-muted-foreground mt-6 text-xs">
          If you contact Live Luxe about this, quote <span className="text-strong font-mono">{refCode}</span>.
        </p>
      )}
    </section>
  );
}
