import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PillTone = "ok" | "warn" | "bad" | "muted" | "neutral";

const TONES: Record<PillTone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  muted: "bg-sunken text-foreground",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * Tinted label for a state that is not a booking status — an SLA band, an account's
 * standing, whether a person is active. Booking statuses keep their own bordered
 * `StatusPill`, which is the one mapping the whole system shares (§10).
 */
export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
