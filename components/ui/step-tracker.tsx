import { Check, X } from "lucide-react";
import type { ProgressModel } from "@/lib/domain/progress";
import { cn } from "@/lib/utils";

/**
 * Where a request is (brief §13 rule 4): Submitted → Live Luxe reviewing → Approved →
 * Confirmed → Check-in details sent. The current step is highlighted and named for
 * screen readers with `aria-current="step"`; an ended request shows the outcome at the
 * step where it stopped. Horizontal from 640 px, a vertical list below.
 */
export function StepTracker({ model, className }: { model: ProgressModel; className?: string }) {
  return (
    <ol aria-label="Progress" className={cn("grid gap-2 sm:grid-cols-5 sm:gap-0", className)}>
      {model.steps.map((s, i) => {
        const label = s.state === "stopped" && model.outcome ? model.outcome : s.label;
        return (
          <li
            key={s.label}
            aria-current={s.state === "current" || s.state === "stopped" ? "step" : undefined}
            className="relative flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2"
          >
            {/* connector */}
            {i < model.steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute hidden h-0.5 sm:top-3.5 sm:right-0 sm:left-8 sm:block",
                  s.state === "done" ? "bg-success-fg" : "bg-subtle",
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "rounded-pill text-body-sm relative z-10 flex h-7 w-7 shrink-0 items-center justify-center border-2 font-semibold",
                s.state === "done" && "border-success-fg bg-success-fg text-surface",
                s.state === "current" && "border-gold bg-gold text-on-gold",
                s.state === "upcoming" && "border-subtle bg-surface text-text-muted",
                s.state === "stopped" && "border-muted-border bg-muted-bg text-muted-fg",
              )}
            >
              {s.state === "done" ? (
                <Check className="h-4 w-4" />
              ) : s.state === "stopped" ? (
                <X className="h-4 w-4" />
              ) : (
                i + 1
              )}
            </span>
            <span
              className={cn(
                "text-body-sm sm:pr-3",
                s.state === "current" || s.state === "stopped" ? "text-text-primary font-semibold" : "",
                s.state === "done" && "text-text-secondary",
                s.state === "upcoming" && "text-text-muted",
              )}
            >
              {label}
              <span className="sr-only">
                {s.state === "done"
                  ? " (done)"
                  : s.state === "current"
                    ? " (now)"
                    : s.state === "stopped"
                      ? ""
                      : " (to come)"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
