"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Copies a reference, code or address (brief §2.4, §8.6: every reference is copyable).
 * Always named ("Copy LLX-2026-000005"), confirms in words for screen readers, and is
 * a real 40 px target (44 px on touch), never hover-only.
 */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked: the value is on screen to select by hand */
        }
      }}
      aria-label={done ? `Copied ${label}` : `Copy ${label}`}
      title={done ? "Copied" : `Copy ${label}`}
      className={cn(
        "text-text-muted hover:text-text-primary hover:bg-inset rounded-control coarse:h-11 coarse:w-11 inline-flex h-8 w-8 shrink-0 items-center justify-center align-middle transition-colors print:hidden",
        className,
      )}
    >
      {done ? <Check className="text-success-fg h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {done ? "Copied" : ""}
      </span>
    </button>
  );
}
