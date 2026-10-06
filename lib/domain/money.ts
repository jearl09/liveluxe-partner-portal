/**
 * Money helpers. All arithmetic is in integer cents (spec §7.2, §9.3).
 * Never use floats for money anywhere in the codebase.
 */

export type Cents = number;

export function assertCents(value: number, label = "amount"): asserts value is Cents {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer number of cents, received ${value}`);
  }
}

/** Apply a percentage to an amount, rounding half-up at this line only. */
export function applyPct(amountCents: Cents, pct: number): Cents {
  assertCents(amountCents);
  return Math.round((amountCents * pct) / 100);
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((acc, v) => {
    assertCents(v);
    return acc + v;
  }, 0);
}

/** AUD $9,169.20 — always with the currency code (spec §13.5). */
export function formatMoney(amountCents: Cents, currency = "AUD", locale = "en-AU"): string {
  assertCents(amountCents);
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amountCents / 100);
  return `${currency} ${formatted}`;
}
