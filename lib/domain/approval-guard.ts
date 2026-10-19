/**
 * Configuration guards around money and inventory (spec §5.1, §10.1 invariant 4: money is never
 * taken for a stay that is not in Hostaway). Pure: callers pass what the environment says.
 *
 *  - A Stripe key pair must be of one mode: a live secret key with a test publishable key (or the
 *    reverse) means the card form and the server talk to different Stripe worlds.
 *  - Approval is refused outright when Stripe is in live mode (real cards, real invoices) while
 *    Hostaway writes are off (no reservation is ever created): Stage 1 of go-live runs with test
 *    keys for exactly this reason.
 */
export type StripeKeyMode = "live" | "test" | "unknown";

/** "live" / "test" from a Stripe key's prefix (sk_, rk_ and pk_ keys all carry it); "unknown" otherwise. */
export function stripeKeyMode(key: string | null | undefined): StripeKeyMode {
  const m = /^(?:sk|rk|pk)_(live|test)_/.exec(key ?? "");
  return m ? (m[1] as "live" | "test") : "unknown";
}

/** The reason the pair cannot be used together, or null when the modes agree (or cannot be told). */
export function stripeKeyPairMismatch(secretKey: string, publishableKey: string): string | null {
  const s = stripeKeyMode(secretKey);
  const p = stripeKeyMode(publishableKey);
  if (s === "unknown" || p === "unknown" || s === p) return null;
  return (
    `STRIPE_SECRET_KEY is a ${s}-mode key but NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is ${p}-mode. ` +
    "Both must come from the same Stripe mode (test with test, live with live)."
  );
}

/**
 * Why approval (and anything that captures money or issues an invoice) must be refused in this
 * configuration, or null when it is safe. Shown to ops as the error detail.
 */
export function approvalBlockedByConfig(args: { stripeSecretKey: string; hostawayWritesEnabled: boolean }): string | null {
  if (stripeKeyMode(args.stripeSecretKey) !== "live" || args.hostawayWritesEnabled) return null;
  return (
    "Stripe is in live mode but Hostaway writes are off, so approving would charge a real card or issue a real " +
    "invoice with no reservation behind it."
  );
}
