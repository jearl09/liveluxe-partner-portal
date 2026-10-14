"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Submit button that shows it is working.
 *
 * Every form in the portal is a plain `<form method="post">` to a Route Handler (not a
 * server action), so `useFormStatus` has nothing to report; this listens to the form's
 * own `submit` event instead. The first submit marks the form busy — a spinner, the
 * pending label, the button disabled — and any further submit while busy is cancelled,
 * which covers a double-click and a second press of Enter. The server still enforces
 * state transitions and idempotency; this only stops the obvious duplicate from leaving
 * the browser.
 *
 * The busy state ends when the page is replaced by the redirect, when the browser
 * restores the page from its back/forward cache, or after a safety timeout so a
 * stalled request never leaves a dead button behind.
 */
export function SubmitButton({
  pendingLabel,
  children,
  className,
  disabled,
  ...rest
}: Omit<ButtonProps, "type"> & { pendingLabel?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;

    const onSubmit = (e: Event) => {
      if (busy.current) {
        e.preventDefault();
        return;
      }
      busy.current = true;
      // Let the browser collect the form data before the button becomes disabled.
      window.setTimeout(() => setPending(true), 0);
    };
    const release = () => {
      busy.current = false;
      setPending(false);
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) release();
    };

    form.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", onPageShow);
    // Marks the moment the guard is live, for tests that must click after hydration.
    ref.current?.setAttribute("data-ready", "");
    return () => {
      form.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => {
      busy.current = false;
      setPending(false);
    }, 20_000);
    return () => window.clearTimeout(t);
  }, [pending]);

  return (
    <Button ref={ref} type="submit" loading={pending} disabled={disabled || pending} className={className} {...rest}>
      {pending ? (pendingLabel ?? children) : children}
      {pending && (
        <span className="sr-only" role="status">
          Working
        </span>
      )}
    </Button>
  );
}
