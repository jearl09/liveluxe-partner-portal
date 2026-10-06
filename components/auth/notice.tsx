import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Inline status box for the public auth screens. */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "error" | "success";
  children: ReactNode;
}) {
  const styles = {
    info: "border-zinc-300 bg-zinc-50 text-zinc-800",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-red-300 bg-red-50 text-red-900",
    success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  }[tone];
  return <div className={cn("space-y-2 rounded-md border p-3 text-xs", styles)}>{children}</div>;
}

/** Human-readable copy for the `error` query parameter the auth Route Handlers redirect with. */
export const PASSWORD_ERRORS: Record<string, string> = {
  too_short: "Use at least 12 characters. A short sentence works well.",
  too_long: "Passwords are limited to 128 characters.",
  contains_email: "Your password must not contain your email address.",
  mismatch: "The two passwords do not match.",
  breached: "That password appears in a known data breach and cannot be used. Please choose another.",
  update_failed: "The password could not be saved. Please try again.",
};

export const inputClass = "w-full rounded-md border px-3 py-2";
