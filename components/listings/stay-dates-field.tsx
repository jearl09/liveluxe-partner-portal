"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { DateRangeField } from "@/components/ui/date-field";
import { addDays } from "@/lib/domain/dates";
import { blockText, dayBlock, type StayCalendar } from "@/lib/domain/stay-picker";

/**
 * The price panel's dates on a property page: the shared date field with this property's stay rules, so it offers
 * only stays the server will price. Choosing a check-out puts the stay in the address, which prices it and marks
 * the same dates on the availability calendar; picking on the calendar does the same the other way round.
 */
export function StayDatesField({
  cal,
  checkIn,
  checkOut,
}: {
  cal: StayCalendar;
  checkIn: string | null;
  checkOut: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const blockFor = useCallback(
    (iso: string, from: string | null) => {
      const r = dayBlock(cal, iso, from);
      return r ? blockText(r) : null;
    },
    [cal],
  );
  return (
    <DateRangeField
      // A new stay from the calendar remounts the field with it.
      key={`${checkIn ?? ""}:${checkOut ?? ""}`}
      label="Dates"
      defaultFrom={checkIn}
      defaultTo={checkOut}
      min={cal.from}
      until={addDays(cal.from, cal.nights.length)}
      required
      compact
      blockFor={blockFor}
      onChange={(from, to) => {
        const next = new URLSearchParams(params.toString());
        next.set("checkIn", from);
        next.set("checkOut", to);
        router.push(`${pathname}?${next.toString()}#price`, { scroll: false });
      }}
    />
  );
}
