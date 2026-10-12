import { Button } from "@/components/ui/button";
import { fieldClasses, labelClass } from "@/components/ui/field";

/**
 * Publish a new rate-card version for one organisation (§9 layer 3). Plain form
 * post; the server validates, so a stale page cannot publish something odd.
 */
export function RateCardForm({
  orgId,
  today,
  values,
  errorFields,
}: {
  orgId: string;
  today: string;
  values: Record<string, string>;
  errorFields: Set<string>;
}) {
  const field = (name: string) => fieldClasses(errorFields.has(name));
  return (
    <form method="post" action={`/api/admin/rate-cards/${orgId}`} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Card name <span className="text-accent">*</span>
          <input name="name" required maxLength={80} defaultValue={values.name} className={field("name")} />
        </label>
        <label className={labelClass}>
          Discount on nightly rate (%)
          <input
            name="discountPct"
            inputMode="decimal"
            placeholder="0"
            defaultValue={values.discountPct}
            className={field("discountPct")}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Takes effect from <span className="text-accent">*</span>
          <input
            name="validFrom"
            type="date"
            required
            min={today}
            defaultValue={values.validFrom || today}
            className={field("validFrom")}
          />
        </label>
        <label className={labelClass}>
          Ends (optional, exclusive)
          <input name="validTo" type="date" min={today} defaultValue={values.validTo} className={field("validTo")} />
        </label>
      </div>

      <label className={labelClass}>
        Extra length-of-stay tiers, one per line as <span className="font-mono">nights:percent</span>
        <textarea
          name="losTiers"
          rows={3}
          placeholder={"90:5\n180:8"}
          defaultValue={values.losTiers}
          className={fieldClasses(errorFields.has("losTiers"), "font-mono")}
        />
        <span className="text-muted-foreground mt-1 block font-normal">
          Hostaway&apos;s own weekly and monthly discounts still apply; the single best tier wins.
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Waive cleaning fee from (nights)
          <input
            name="cleaningFeeFromNights"
            inputMode="numeric"
            placeholder="e.g. 28"
            defaultValue={values.cleaningFeeFromNights}
            className={field("cleaningFeeFromNights")}
          />
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input
            type="checkbox"
            name="waiveSecurityDeposit"
            defaultChecked={values.waiveSecurityDeposit === "on"}
            className="accent-gold-500 h-4 w-4"
          />
          No security deposit for this partner
        </label>
      </div>

      <p className="text-muted-foreground text-xs">
        Publishing closes the current card the day before the new one starts. Quotes already issued keep the card
        version they were priced with.
      </p>
      <Button type="submit" variant="gold">
        Publish new version
      </Button>
    </form>
  );
}
