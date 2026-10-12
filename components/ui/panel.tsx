import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The portal's one bordered surface (§13.5).
 *
 * A panel holds one subject — a quote, a timeline, a form — and the page decides how
 * many it needs; most need fewer than they think. Thirty hand-rolled copies of this
 * shell used to live across the app, split between two corner radii and three
 * paddings. Keeping the surface here means they cannot drift again.
 *
 * `flush` drops the padding for content that wants the panel's edges: tables, divided
 * lists, and panels split into `PanelSection`s (add `divide-y` for the hairlines).
 */
export function Panel({
  as: Tag = "section",
  flush = false,
  className,
  children,
  ...rest
}: {
  as?: "section" | "div" | "aside" | "article";
  flush?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"section">, "className" | "children">) {
  return (
    <Tag className={cn("border-border bg-card rounded-lg border", !flush && "p-5", className)} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * Title row of a panel: serif heading, optional one-line description, optional actions
 * on the trailing edge. Inside a `flush` panel it carries its own padding and hairline.
 */
export function PanelHeading({
  id,
  title,
  description,
  actions,
  flush = false,
  className,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-2",
        flush ? "border-border border-b px-5 py-4" : "mb-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 id={id} className="font-serif text-xl leading-tight">
          {title}
        </h2>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** One padded, hairline-divided section of a `flush` panel. */
export function PanelSection({ className, children, ...rest }: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("px-5 py-4", className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * Label for a group of fields or facts inside a panel: a sans tier below the serif
 * panel heading, so a form can have sections without each one becoming a card.
 */
export function GroupLabel({ className, children, ...rest }: ComponentPropsWithoutRef<"h3">) {
  return (
    <h3 className={cn("text-strong font-sans text-sm font-medium tracking-normal", className)} {...rest}>
      {children}
    </h3>
  );
}
