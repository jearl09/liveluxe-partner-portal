"use client";

import { useEffect, useId, useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker, type DateRange } from "react-day-picker";
import { addDays, differenceInCalendarDays, format, isValid, parseISO, startOfToday } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Date fields (brief §4.5): a Calendar in a Popover, never a native date input.
 * Range mode for stays shows the nights live ("5 nights"); dates are property-local
 * calendar dates and post as ISO `YYYY-MM-DD` through hidden inputs, so every plain
 * HTML form and every route handler keeps working unchanged.
 */

const ISO = "yyyy-MM-dd";
const LONG = "EEE d MMM yyyy";
const toDate = (iso?: string | null) => {
  if (!iso) return undefined;
  const d = parseISO(iso);
  return isValid(d) ? d : undefined;
};
const toIso = (d?: Date) => (d ? format(d, ISO) : "");

const CAL_CLASSES = {
  root: "text-body-sm",
  months: "flex flex-col gap-6 sm:flex-row",
  month: "space-y-3",
  month_caption: "flex h-9 items-center justify-center",
  caption_label: "font-serif text-h3 font-medium text-text-primary",
  nav: "absolute inset-x-3 top-3 flex items-center justify-between",
  button_previous:
    "inline-flex h-9 w-9 items-center justify-center rounded-control text-text-primary hover:bg-inset disabled:opacity-30",
  button_next:
    "inline-flex h-9 w-9 items-center justify-center rounded-control text-text-primary hover:bg-inset disabled:opacity-30",
  month_grid: "border-collapse",
  weekdays: "",
  weekday: "h-8 w-10 text-center text-body-sm font-semibold text-text-muted",
  week: "",
  day: "p-0 text-center",
  day_button:
    "inline-flex h-10 w-10 items-center justify-center rounded-control text-text-primary tabular-nums transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  today: "font-semibold underline decoration-2 underline-offset-4",
  selected: "",
  range_start: "[&>button]:bg-gold [&>button]:text-on-gold [&>button]:hover:bg-gold-hover",
  range_end: "[&>button]:bg-gold [&>button]:text-on-gold [&>button]:hover:bg-gold-hover",
  range_middle: "bg-inset [&>button]:rounded-none",
  outside: "text-text-muted opacity-50",
  disabled: "[&>button]:text-text-muted [&>button]:line-through [&>button]:opacity-50 [&>button]:hover:bg-transparent",
  hidden: "invisible",
} as const;

function Chevron({ orientation }: { orientation?: "left" | "right" | "up" | "down" }) {
  return orientation === "left" ? (
    <ChevronLeft className="h-4 w-4" aria-hidden />
  ) : (
    <ChevronRight className="h-4 w-4" aria-hidden />
  );
}

function useTwoMonths() {
  const [two, setTwo] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const on = () => setTwo(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return two;
}

const triggerClass =
  "flex min-h-10 w-full items-center gap-2 rounded-control border border-strong-border bg-inset px-3 text-left text-body text-text-primary transition-colors hover:border-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus coarse:min-h-11";

export interface DateRangeFieldProps {
  label: string;
  nameFrom?: string;
  nameTo?: string;
  defaultFrom?: string | null;
  defaultTo?: string | null;
  /** Earliest selectable date (ISO). Defaults to today. */
  min?: string;
  required?: boolean;
  invalid?: boolean;
  /** Helper line under the field. */
  hint?: string;
  error?: string;
  className?: string;
  onChange?: (from: string, to: string) => void;
}

/** Stay dates: check-in → check-out with the night count shown as soon as both are picked. */
export function DateRangeField(p: DateRangeFieldProps) {
  const id = useId();
  const two = useTwoMonths();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const from = toDate(p.defaultFrom);
    const to = toDate(p.defaultTo);
    return from ? { from, to } : undefined;
  });
  const min = useMemo(() => toDate(p.min) ?? startOfToday(), [p.min]);
  const nights = range?.from && range?.to ? differenceInCalendarDays(range.to, range.from) : 0;

  const summary =
    range?.from && range?.to ? (
      <>
        <span className="truncate">
          {format(range.from, LONG)} → {format(range.to, LONG)}
        </span>
      </>
    ) : range?.from ? (
      <span className="truncate">{format(range.from, LONG)} → choose check-out</span>
    ) : (
      <span className="text-text-muted truncate">Choose check-in and check-out</span>
    );

  return (
    <div className={p.className}>
      <span id={`${id}-label`} className="text-text-primary text-body-sm block font-semibold">
        {p.label}
        {p.required && (
          <span className="text-gold ml-0.5" aria-hidden>
            *
          </span>
        )}
      </span>
      <input type="hidden" name={p.nameFrom ?? "checkIn"} value={toIso(range?.from)} />
      <input type="hidden" name={p.nameTo ?? "checkOut"} value={toIso(range?.to)} />
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          type="button"
          aria-labelledby={`${id}-label ${id}-value`}
          aria-describedby={p.error ? `${id}-err` : p.hint ? `${id}-hint` : undefined}
          aria-invalid={p.invalid || undefined}
          aria-required={p.required || undefined}
          className={cn(triggerClass, "mt-1", p.invalid && "border-danger-fg")}
        >
          <CalendarDays className="text-text-muted h-4 w-4 shrink-0" aria-hidden />
          <span id={`${id}-value`} className="flex min-w-0 flex-1 items-center">
            {summary}
          </span>
          {nights > 0 && (
            <span className="text-text-secondary text-body-sm shrink-0 tabular-nums">
              {nights} {nights === 1 ? "night" : "nights"}
            </span>
          )}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            collisionPadding={12}
            className="bg-surface-raised border-subtle rounded-card relative z-50 max-h-(--radix-popover-content-available-height) overflow-y-auto border p-3 shadow-md"
          >
            <DayPicker
              mode="range"
              selected={range}
              onSelect={(r) => {
                setRange(r);
                if (r?.from && r?.to && r.to > r.from) {
                  p.onChange?.(toIso(r.from), toIso(r.to));
                }
              }}
              min={1}
              numberOfMonths={two ? 2 : 1}
              defaultMonth={range?.from ?? min}
              disabled={{ before: min }}
              weekStartsOn={1}
              showOutsideDays={false}
              classNames={CAL_CLASSES}
              components={{ Chevron }}
            />
            <div className="border-subtle mt-3 flex items-center justify-between gap-3 border-t pt-3">
              <p className="text-text-secondary text-body-sm" aria-live="polite">
                {nights > 0
                  ? `${nights} ${nights === 1 ? "night" : "nights"}`
                  : range?.from
                    ? "Now choose check-out"
                    : "Choose check-in"}
              </p>
              <div className="flex gap-2">
                {range?.from && (
                  <button
                    type="button"
                    onClick={() => setRange(undefined)}
                    className="text-text-primary rounded-control text-body-sm px-2 py-1 hover:underline"
                  >
                    Clear
                  </button>
                )}
                <Popover.Close
                  disabled={!(range?.from && range?.to)}
                  className="bg-gold text-on-gold hover:bg-gold-hover rounded-control text-body-sm h-9 px-3 font-semibold disabled:opacity-50"
                >
                  Done
                </Popover.Close>
              </div>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {p.error ? (
        <span id={`${id}-err`} className="text-danger-fg text-body-sm mt-1 block">
          {p.error}
        </span>
      ) : p.hint ? (
        <span id={`${id}-hint`} className="text-text-muted text-body-sm mt-1 block">
          {p.hint}
        </span>
      ) : null}
    </div>
  );
}

export interface DateFieldProps {
  label: string;
  name: string;
  defaultValue?: string | null;
  min?: string;
  required?: boolean;
  /** Allow clearing (optional end dates such as "Last day in force"). */
  clearable?: boolean;
  hint?: string;
  error?: string;
  className?: string;
}

/** A single calendar date. */
export function DateField(p: DateFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<Date | undefined>(() => toDate(p.defaultValue));
  const min = useMemo(() => toDate(p.min), [p.min]);
  return (
    <div className={p.className}>
      <span id={`${id}-label`} className="text-text-primary text-body-sm block font-semibold">
        {p.label}
        {p.required && (
          <span className="text-gold ml-0.5" aria-hidden>
            *
          </span>
        )}
      </span>
      <input type="hidden" name={p.name} value={toIso(day)} />
      <div className="mt-1 flex gap-2">
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            type="button"
            aria-labelledby={`${id}-label ${id}-value`}
            aria-describedby={p.error ? `${id}-err` : p.hint ? `${id}-hint` : undefined}
            aria-required={p.required || undefined}
            className={cn(triggerClass, p.error && "border-danger-fg")}
          >
            <CalendarDays className="text-text-muted h-4 w-4 shrink-0" aria-hidden />
            <span id={`${id}-value`} className={cn("truncate", !day && "text-text-muted")}>
              {day ? format(day, LONG) : "Choose a date"}
            </span>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={6}
              collisionPadding={12}
              className="bg-surface-raised border-subtle rounded-card relative z-50 max-h-(--radix-popover-content-available-height) overflow-y-auto border p-3 shadow-md"
            >
              <DayPicker
                mode="single"
                selected={day}
                onSelect={(d) => {
                  setDay(d);
                  if (d) setOpen(false);
                }}
                defaultMonth={day ?? min ?? new Date()}
                disabled={min ? { before: min } : undefined}
                weekStartsOn={1}
                showOutsideDays={false}
                classNames={{
                  ...CAL_CLASSES,
                  selected: "[&>button]:bg-gold [&>button]:text-on-gold [&>button]:hover:bg-gold-hover",
                }}
                components={{ Chevron }}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        {p.clearable && day && (
          <button
            type="button"
            onClick={() => setDay(undefined)}
            aria-label={`Clear ${p.label.toLowerCase()}`}
            className="border-strong-border text-text-primary hover:bg-inset rounded-control inline-flex h-10 w-10 shrink-0 items-center justify-center border"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {p.error ? (
        <span id={`${id}-err`} className="text-danger-fg text-body-sm mt-1 block">
          {p.error}
        </span>
      ) : p.hint ? (
        <span id={`${id}-hint`} className="text-text-muted text-body-sm mt-1 block">
          {p.hint}
        </span>
      ) : null}
    </div>
  );
}

/** Tonight → +N nights, as ISO strings, for smart defaults (brief §13 rule 5). */
export function defaultStay(nights = 7, from: Date = startOfToday()): { checkIn: string; checkOut: string } {
  return { checkIn: toIso(from), checkOut: toIso(addDays(from, nights)) };
}
