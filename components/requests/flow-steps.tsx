import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Where the partner is in sending a request (brief §7.5): guest and references,
 * review, and — for card-paying partners — the card hold. The last step only shows
 * when it applies.
 */
export function FlowSteps({ current, withCard }: { current: 0 | 1 | 2; withCard: boolean }) {
  const steps = ["Guest and references", "Review and send", ...(withCard ? ["Authorise your card"] : [])];
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Request steps">
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={s} className="flex items-center gap-2" aria-current={now ? "step" : undefined}>
            {i > 0 && <span className={cn("h-px w-6", done || now ? "bg-gold" : "bg-strong-border")} aria-hidden />}
            <span
              className={cn(
                "rounded-pill text-body-sm inline-flex h-7 w-7 items-center justify-center font-semibold tabular-nums",
                done && "bg-success-fg text-surface",
                now && "bg-gold text-on-gold",
                !done && !now && "border-strong-border text-text-muted border",
              )}
              aria-hidden
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cn("text-body-sm", now ? "text-text-primary font-semibold" : "text-text-secondary")}>
              <span className="sr-only">{done ? "Done: " : now ? "Current step: " : "Next: "}</span>
              {s}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
