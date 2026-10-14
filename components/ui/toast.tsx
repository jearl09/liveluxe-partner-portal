"use client";

import { useState } from "react";
import * as T from "@radix-ui/react-toast";
import { CheckCircle2, X } from "lucide-react";

/**
 * Toast (brief §4.8): bottom-right, 5 s, for the confirmation of something the user
 * just did. Never for an error that needs reading — those stay inline. The message
 * says what changed and what happens next (brief §13 rule 6).
 *
 * Rendered by the server from a one-shot `?done=` flash, so it needs no store: it
 * mounts open and closes itself.
 */
export function Toast({ title, body }: { title: string; body?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <T.Provider duration={5000} swipeDirection="right" label="Notification">
      <T.Root
        open={open}
        onOpenChange={setOpen}
        className="bg-surface-raised border-subtle text-text-primary anim-toast rounded-card flex w-full items-start gap-3 border p-4 shadow-lg"
      >
        <CheckCircle2 className="text-success-fg mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <T.Title className="text-body font-semibold">{title}</T.Title>
          {body && <T.Description className="text-text-secondary text-body-sm mt-0.5">{body}</T.Description>}
        </div>
        <T.Close
          aria-label="Dismiss"
          className="text-text-muted hover:text-text-primary rounded-control focus-visible:outline-focus -m-1 p-1 focus-visible:outline-2"
        >
          <X className="h-4 w-4" aria-hidden />
        </T.Close>
      </T.Root>
      <T.Viewport className="fixed right-0 bottom-0 z-40 flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
    </T.Provider>
  );
}
