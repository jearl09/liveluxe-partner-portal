import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STATUS_TONE_CLASSES, pillClass } from "./status-pill";

/** Legacy tone names map onto the five status tones; `info` is the new addition. */
export type PillTone = "info" | "attention" | "success" | "danger" | "muted" | "neutral" | "ok" | "warn" | "bad";

const ALIAS: Record<PillTone, keyof typeof STATUS_TONE_CLASSES> = {
  info: "info",
  attention: "attention",
  success: "success",
  danger: "danger",
  muted: "muted",
  neutral: "neutral",
  ok: "success",
  warn: "attention",
  bad: "danger",
};

/**
 * Tinted label for a state that is not a booking status — an SLA band, an account's
 * standing, whether a person is active, an invoice state. Booking statuses use
 * `StatusPill`; the decision clock uses `SlaBadge`.
 */
export function Pill({
  tone = "neutral",
  className,
  children,
  ...rest
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"span">, "className" | "children">) {
  return (
    <span className={cn(pillClass, STATUS_TONE_CLASSES[ALIAS[tone]], className)} {...rest}>
      {children}
    </span>
  );
}
