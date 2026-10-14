"use client";

import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { HelpCircle } from "lucide-react";

/**
 * A small "?" that explains a term right where someone might hesitate (brief §13 rule 3).
 * A popover rather than a hover tooltip, so it opens on tap on a tablet and stays open
 * long enough to read. The trigger always has a name ("What is a hold?").
 */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        aria-label={label}
        className="text-text-muted hover:text-text-primary rounded-pill focus-visible:outline-focus coarse:h-11 coarse:w-11 inline-flex h-6 w-6 shrink-0 items-center justify-center align-middle focus-visible:outline-2 focus-visible:outline-offset-1"
      >
        <HelpCircle className="h-4 w-4" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          className="bg-surface-raised border-subtle text-text-secondary rounded-card text-body-sm z-50 max-w-xs border p-3 shadow-md"
        >
          {children}
          <Popover.Arrow className="fill-surface-raised" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
