"use client";

import { useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "livluxe.welcome.dismissed";

/**
 * First-visit help (brief §13 rule 9): three steps and who to contact, on the
 * dashboard, dismissible, never a modal tour. Remembered per browser; a partner who
 * clears storage simply sees it again, which is harmless.
 */
function readDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
const noop = () => () => {};

export function WelcomeCard({ supportEmail }: { supportEmail: string }) {
  // Server and first paint: hidden, so a returning partner never sees it flash.
  const stored = useSyncExternalStore(noop, readDismissed, () => true);
  const [dismissedNow, setDismissedNow] = useState(false);
  if (stored || dismissedNow) return null;
  const dismiss = () => {
    setDismissedNow(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* storage blocked: it hides for this visit */
    }
  };
  const steps = [
    ["Search", "Pick a suburb and the dates. You see what is free and the full price for the stay."],
    ["Request", "Add the guest and your claim or PO reference. Nothing is booked or charged yet."],
    ["We confirm", "Live Luxe replies within a few business hours. You get an email either way."],
  ] as const;
  return (
    <section aria-labelledby="welcome-heading" className="bg-surface border-subtle rounded-card relative border p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide this welcome"
        className="text-text-muted hover:text-text-primary rounded-control focus-visible:outline-focus coarse:h-11 coarse:w-11 absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center focus-visible:outline-2"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
      <h2 id="welcome-heading" className="pr-10">
        Welcome to the Live Luxe partner portal
      </h2>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="bg-gold text-on-gold rounded-pill text-body-sm flex h-7 w-7 shrink-0 items-center justify-center font-semibold">
              {i + 1}
            </span>
            <span>
              <span className="text-text-primary block font-semibold">{title}</span>
              <span className="text-text-secondary text-body-sm block">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="border-subtle mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-text-secondary text-body-sm">
          Questions or something urgent? Email{" "}
          <a className="text-text-primary underline" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>
          .
        </p>
        <Button variant="tertiary" size="sm" onClick={dismiss}>
          Got it, hide this
        </Button>
      </div>
    </section>
  );
}
