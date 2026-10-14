"use client";

import { useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

/**
 * Submit button for the handful of actions the UI cannot take back — removing
 * someone's access, revoking an invitation, declining a request, turning off 2FA.
 *
 * First press arms it: the button is replaced, in place, by an explicit red
 * "Confirm …" and a Cancel. Second press submits the surrounding form. No modal, no
 * portal, nothing to trap focus in; the confirmation lands exactly where the eye
 * already is and Escape or Cancel puts the row back. The arming step is client state
 * only — the form, its action and its fields stay server-rendered.
 */
export function ConfirmButton({
  confirmLabel,
  pendingLabel = "Working…",
  children,
  variant = "destructive",
  size = "default",
  className,
  ...rest
}: Omit<ButtonProps, "type" | "onClick"> & { confirmLabel: string; pendingLabel?: string; children: ReactNode }) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setArmed(true)}
        {...rest}
      >
        {children}
      </Button>
    );
  }

  return (
    <span
      role="group"
      aria-label={confirmLabel}
      className={cn("inline-flex items-center gap-1.5", className)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setArmed(false);
        }
      }}
    >
      <SubmitButton
        variant="destructive-solid"
        size={size}
        className="flex-1"
        pendingLabel={pendingLabel}
        autoFocus
        {...rest}
      >
        {confirmLabel}
      </SubmitButton>
      <Button type="button" variant="tertiary" size={size} onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}
