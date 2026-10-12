"use client";

import { useEffect } from "react";

/**
 * Removes one-shot query parameters from the address bar after the page has shown
 * them. Outcomes travel in the URL (`?done=approved`) because every mutation is a
 * Route Handler that redirects with a 303 — simple and log-friendly — but a URL is also
 * a bookmark and a history entry, so without this a refresh or Back replays "Approved."
 * on a page where nothing just happened.
 *
 * Only the named keys are dropped; filters, tabs, pagination and the values a bounced
 * form carries back (`?fields=…&name=…`) stay exactly as they are. `replaceState` is
 * patched by the App Router, so the router's own URL stays in step and nothing
 * navigates or re-fetches.
 */
export function ScrubParams({ keys }: { keys: readonly string[] }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of keys) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    // Runs once per mount: the message is already in the DOM by then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** The outcome keys every portal page's `Flash` reads. */
export const FLASH_KEYS = ["done", "submitted", "error", "detail", "ref"] as const;

/** The outcome keys the public auth screens read. `setup` is configuration state, not an outcome, and stays. */
export const AUTH_FLASH_KEYS = ["error", "reset", "invited", "mfa"] as const;
