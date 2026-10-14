"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { fieldClasses, fieldErrorClass, labelClass } from "@/components/ui/field";
import { addDays } from "@/lib/domain/dates";
import { cn, formatDate } from "@/lib/utils";

type Tier = { nights: string; pct: string };

const parseTiers = (raw: string): Tier[] =>
  raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [nights = "", pct = ""] = l.split(":");
      return { nights: nights.trim(), pct: pct.trim() };
    });

const req = (
  <span className="text-gold ml-0.5" aria-hidden>
    *
  </span>
);

/**
 * Publish a rate-card version (brief §6.6). Tiers are edited as rows and posted as the
 * "nights:percent" lines the server already validates; "Last day in force" is inclusive
 * and the route turns it into the exclusive end. Publishing asks once more, saying what
 * it closes and when the new card applies.
 */
export function RateCardForm({
  orgId,
  today,
  tomorrow,
  values,
  errorFields,
  current,
}: {
  orgId: string;
  today: string;
  tomorrow: string;
  values: Record<string, string>;
  errorFields: Set<string>;
  /** The card in force today, for the confirmation sentence. */
  current: { name: string } | null;
}) {
  const [tiers, setTiers] = useState<Tier[]>(() => {
    const t = parseTiers(values.losTiers ?? "");
    return t.length ? t : [];
  });
  const [from, setFrom] = useState(values.validFrom || tomorrow);
  const [confirming, setConfirming] = useState(false);
  const sorted = [...tiers].filter((t) => t.nights && t.pct).sort((a, b) => Number(a.nights) - Number(b.nights));
  const dupes = new Set(sorted.map((t) => t.nights)).size !== sorted.length;
  const field = (name: string) => fieldClasses(errorFields.has(name));
  const err = (name: string, text: string) => errorFields.has(name) && <span className={fieldErrorClass}>{text}</span>;

  return (
    <form method="post" action={`/api/admin/rate-cards/${orgId}`} className="space-y-5 px-5 py-5">
      <input type="hidden" name="losTiers" value={sorted.map((t) => `${t.nights}:${t.pct}`).join("\n")} />

      <label className={labelClass}>
        <span>Card name{req}</span>
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={values.name}
          placeholder="2027 corporate card"
          className={field("name")}
        />
        {err("name", "Give the card a name.")}
      </label>

      <label className={labelClass}>
        Discount on the nightly rate (%)
        <input
          name="discountPct"
          inputMode="decimal"
          placeholder="0"
          defaultValue={values.discountPct}
          className={field("discountPct")}
        />
        {err("discountPct", "Enter a percentage between 0 and 100.")}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          label="Takes effect"
          name="validFrom"
          defaultValue={from}
          min={today}
          required
          onChange={setFrom}
          error={errorFields.has("validFrom") ? "Choose today or a later date." : undefined}
        />
        <DateField
          label="Last day in force (optional)"
          name="lastDay"
          defaultValue={values.lastDay}
          min={from}
          clearable
          hint="Leave empty to keep it in force until the next version."
          error={errorFields.has("validTo") ? "The last day must be on or after the start." : undefined}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-text-primary text-body-sm font-semibold">Length-of-stay tiers</legend>
        <p className="text-text-secondary text-body-sm">
          Hostaway&apos;s own weekly and monthly discounts still apply; the single best tier wins.
        </p>
        {tiers.map((t, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="text-text-secondary text-body-sm">From</span>
            <input
              aria-label={`Tier ${i + 1}: from nights`}
              inputMode="numeric"
              value={t.nights}
              onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, nights: e.target.value } : x)))}
              className={cn(fieldClasses(errorFields.has("losTiers")), "mt-0 w-20")}
            />
            <span className="text-text-secondary text-body-sm">nights, extra</span>
            <input
              aria-label={`Tier ${i + 1}: extra percent`}
              inputMode="decimal"
              value={t.pct}
              onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))}
              className={cn(fieldClasses(errorFields.has("losTiers")), "mt-0 w-20")}
            />
            <span className="text-text-secondary text-body-sm">%</span>
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
              aria-label={`Remove tier ${i + 1}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setTiers([...tiers, { nights: "", pct: "" }])}
        >
          <Plus className="h-4 w-4" aria-hidden /> Add tier
        </Button>
        {dupes && <p className={fieldErrorClass}>Two tiers start at the same number of nights.</p>}
        {err("losTiers", "Each tier needs whole nights and a percentage.")}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-text-primary text-body-sm font-semibold">Fees</legend>
        <label className={labelClass}>
          Waive the cleaning fee from (nights)
          <input
            name="cleaningFeeFromNights"
            inputMode="numeric"
            placeholder="e.g. 28"
            defaultValue={values.cleaningFeeFromNights}
            className={cn(field("cleaningFeeFromNights"), "block max-w-40")}
          />
        </label>
        <label className="text-text-primary flex items-center gap-3">
          <input
            type="checkbox"
            role="switch"
            name="waiveSecurityDeposit"
            defaultChecked={values.waiveSecurityDeposit === "on"}
            className="h-5 w-5"
          />
          No security deposit for this partner
        </label>
      </fieldset>

      <p className="text-text-muted text-body-sm">Quotes already issued keep the card version they were priced with.</p>

      {!confirming ? (
        <Button
          type="button"
          variant="primary"
          className="w-full sm:w-auto"
          disabled={dupes}
          onClick={() => setConfirming(true)}
        >
          Review and publish
        </Button>
      ) : (
        <div
          role="alert"
          className="border-attention-border bg-attention-bg rounded-control space-y-3 border px-4 py-3"
        >
          <p className="text-text-primary">
            {current
              ? `This closes “${current.name}” at the end of ${formatDate(addDays(from, -1))} and applies the new card to quotes created from ${formatDate(from)}.`
              : `This applies the new card to quotes created from ${formatDate(from)}.`}{" "}
            Open quotes keep their current price.
          </p>
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="primary" pendingLabel="Publishing…">
              Publish version
            </SubmitButton>
            <Button type="button" variant="tertiary" onClick={() => setConfirming(false)}>
              Go back
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
