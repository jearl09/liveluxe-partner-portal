"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateRangeField } from "@/components/ui/date-field";
import { Dialog, DialogPrimitive } from "@/components/ui/dialog";

/**
 * "Can't find the right property?" (brief §13 rule 10). A short form — dates, suburb,
 * household, notes — that the operations team answers by email. There is no ticket
 * endpoint yet (NEEDS_BACKEND.md #1), so submitting opens the partner's email app with
 * everything filled in, addressed to Live Luxe. The partner sees exactly that, in words.
 */
export function ManualSearch({
  to,
  orgName,
  triggerVariant = "secondary",
}: {
  to: string;
  orgName: string;
  triggerVariant?: "secondary" | "primary";
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const lines = [
      `Manual search request from ${orgName}`,
      "",
      `Suburb or area: ${get("suburb") || "—"}`,
      `Dates: ${get("checkIn") || "—"} to ${get("checkOut") || "—"}`,
      `Guests: ${get("adults") || "0"} adults, ${get("children") || "0"} children, ${get("pets") || "0"} pets`,
      `Claim or PO reference: ${get("reference") || "—"}`,
      "",
      get("notes"),
    ];
    const subject = `Manual search: ${get("suburb") || "property needed"}${get("checkIn") ? ` from ${get("checkIn")}` : ""}`;
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
    setSent(true);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSent(false);
      }}
      title={sent ? "Your email is ready to send" : "Ask us to find a property"}
      description={
        sent
          ? undefined
          : "Tell us what you need and the operations team will search for you, including properties not listed here."
      }
      trigger={
        <Button variant={triggerVariant}>
          <Mail className="h-5 w-5" aria-hidden /> Ask us to find one
        </Button>
      }
    >
      {sent ? (
        <div className="space-y-4 px-5 py-4">
          <p className="text-text-secondary">
            Your email app opened with the details filled in, addressed to {to}. Press send there and the team will
            reply, usually within a few business hours.
          </p>
          <p className="text-text-muted text-body-sm">
            If nothing opened, email {to} directly with the dates, suburb and household.
          </p>
          <div className="flex justify-end">
            <DialogPrimitive.Close asChild>
              <Button variant="primary">Done</Button>
            </DialogPrimitive.Close>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <label className="text-text-primary text-body-sm block font-semibold">
              Suburb or area
              <input name="suburb" className="mt-1 w-full" placeholder="Docklands, or near a street address" />
            </label>
            <DateRangeField label="Dates" />
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["adults", "Adults", 2],
                  ["children", "Children", 0],
                  ["pets", "Pets", 0],
                ] as const
              ).map(([name, label, def]) => (
                <label key={name} className="text-text-primary text-body-sm block font-semibold">
                  {label}
                  <input name={name} type="number" min={0} max={20} defaultValue={def} className="mt-1 w-full" />
                </label>
              ))}
            </div>
            <label className="text-text-primary text-body-sm block font-semibold">
              Claim or PO reference
              <input name="reference" className="mt-1 w-full font-mono uppercase" placeholder="Optional" />
            </label>
            <label className="text-text-primary text-body-sm block font-semibold">
              Anything else
              <textarea
                name="notes"
                rows={3}
                className="mt-1 w-full"
                placeholder="Accessibility, parking, pets, how far from the home, budget"
              />
            </label>
          </div>
          <footer className="border-subtle flex flex-col-reverse gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <DialogPrimitive.Close asChild>
              <Button variant="tertiary" type="button">
                Cancel
              </Button>
            </DialogPrimitive.Close>
            <Button type="submit" variant="primary" className="w-full sm:w-auto">
              Open my email to send
            </Button>
          </footer>
        </form>
      )}
    </Dialog>
  );
}
