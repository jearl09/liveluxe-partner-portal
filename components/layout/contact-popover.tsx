"use client";

import * as Popover from "@radix-ui/react-popover";
import { Mail } from "lucide-react";

/** "Contact Live Luxe" in the partner footer (brief §7.1): a human is always one click away. */
export function ContactPopover({ email }: { email: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger className="text-text-primary rounded-control inline-flex h-10 items-center underline underline-offset-4 hover:no-underline">
        Contact Live Luxe
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          className="bg-surface-raised border-subtle text-text-secondary rounded-card z-50 w-72 border p-4 text-left shadow-md"
        >
          <p className="text-text-primary font-semibold">Live Luxe operations</p>
          <p className="text-body-sm mt-1">For bookings, check-in problems or anything urgent.</p>
          <a
            href={`mailto:${email}`}
            className="text-text-primary hover:bg-inset rounded-control mt-3 flex h-10 items-center gap-2 px-2 font-semibold"
          >
            <Mail className="h-4 w-4" aria-hidden /> {email}
          </a>
          <p className="text-text-muted text-body-sm mt-2">
            Quote your booking reference (LLX-…) so we can find it fast.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
