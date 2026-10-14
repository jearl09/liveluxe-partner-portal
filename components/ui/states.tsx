import type { ReactNode } from "react";
import { AlertTriangle, type LucideIcon } from "lucide-react";
import { formatTimestamp } from "@/lib/utils";
import { ageLabel, type SyncModel } from "@/lib/domain/progress";
import { cn } from "@/lib/utils";

/*
 * Designed states (brief §9): EmptyState, ErrorState, SyncState.
 */

/** Icon, what would be here, how it gets here, and the action if the viewer can create it (brief §4.8). */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <span className="bg-inset text-text-muted rounded-pill flex h-12 w-12 items-center justify-center">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <p className="text-text-primary text-h3 mt-4 font-semibold">{title}</p>
      <p className="text-text-muted text-body mt-1 max-w-md">{body}</p>
      {action && <div className="mt-5 w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto">{action}</div>}
    </div>
  );
}

/**
 * What happened, what it means, what to do, and the support reference (brief §5.7,
 * §11.2: three sentences). Never a raw code or a stack.
 */
export function ErrorState({
  title,
  meaning,
  next,
  action,
  refCode,
  className,
}: {
  title: string;
  meaning: ReactNode;
  next: ReactNode;
  action?: ReactNode;
  refCode?: string | null;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("border-danger-border bg-danger-bg rounded-card border p-5", className)}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-danger-fg mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-danger-fg text-body font-semibold">{title}</p>
          <p className="text-text-primary text-body">{meaning}</p>
          <p className="text-text-primary text-body">{next}</p>
          {refCode && (
            <p className="text-text-muted text-body-sm">
              Support reference <span className="font-mono uppercase">{refCode}</span>
            </p>
          )}
          {action && <div className="pt-2">{action}</div>}
        </div>
      </div>
    </div>
  );
}

const DOT = {
  live: "bg-success-fg",
  delayed: "bg-attention-fg",
  degraded: "bg-danger-fg",
  unknown: "bg-text-muted",
} as const;

/**
 * Availability freshness, exactly once per page (brief §4.6, §9.3). Partners never see
 * the words "sync" or "Hostaway" (brief §11.2); ops should, so they know where to look.
 */
export function SyncState({
  model,
  audience,
  className,
  compact = false,
}: {
  model: SyncModel;
  audience: "partner" | "ops";
  className?: string;
  /** Short wording for the header; the full sentence moves to the tooltip. */
  compact?: boolean;
}) {
  const at = model.lastConfirmedAt ? formatTimestamp(model.lastConfirmedAt) : null;
  const time = at ? at.replace(/^.*?, /, "") : null;
  const text =
    model.level === "live"
      ? `Availability confirmed ${ageLabel(model.ageMinutes ?? 0)}`
      : model.level === "delayed"
        ? audience === "ops"
          ? `Sync delayed — last confirmed ${time}`
          : `Availability last confirmed ${time}. We re-check before you submit.`
        : model.level === "degraded"
          ? audience === "ops"
            ? "Hostaway connection lost — showing cached data"
            : `Live availability is temporarily unavailable${time ? ` — showing what we confirmed at ${time}` : ""}.`
          : audience === "ops"
            ? "Not synced yet"
            : "Availability has not been confirmed yet.";
  const short =
    model.level === "live"
      ? text
      : model.level === "delayed"
        ? audience === "ops"
          ? `Sync delayed · ${time}`
          : `Availability as of ${time}`
        : model.level === "degraded"
          ? audience === "ops"
            ? "Hostaway connection lost"
            : "Live availability paused"
          : "Availability not confirmed";
  return (
    <p
      className={cn(
        "text-text-secondary text-body-sm inline-flex items-center gap-2",
        compact && "whitespace-nowrap",
        className,
      )}
      title={compact ? text : at ? `Last confirmed ${at}` : undefined}
    >
      <span className={cn("rounded-pill h-2 w-2 shrink-0", DOT[model.level])} aria-hidden />
      <span>{compact ? short : text}</span>
    </p>
  );
}
