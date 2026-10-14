"use client";

/**
 * Stripe Payment Element for one booking (spec §11.2 "enable via the Payment
 * Element rather than hard-coding a card form"). The client secret comes from
 * GET /api/requests/{id}/pay; the amount is never set here. On confirm, Stripe
 * redirects to the return URL and the server re-fetches the intent.
 */
import { useEffect, useState, type FormEvent } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";

/** Stripe.js is loaded once per page; the publishable key never changes at runtime. */
let stripeSingleton: Promise<Stripe | null> | null = null;
const stripeJs = (publishableKey: string) => (stripeSingleton ??= loadStripe(publishableKey));

interface IntentPayload {
  clientSecret: string | null;
  amountCents: number;
  currency: string;
  mode: "authorise" | "charge";
  state: string;
  publishableKey: string;
}

function CheckoutForm({ returnUrl, mode }: { returnUrl: string; mode: "authorise" | "charge" }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl } });
      // Only reached when confirmation failed before redirect (validation, decline, network).
      setMessage(error?.message ?? "Something went wrong. Please try again.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {message && (
        <p
          role="alert"
          className="border-danger-border bg-danger-bg text-danger-fg rounded-md border px-3 py-2 text-sm"
        >
          {message}
        </p>
      )}
      <Button type="submit" variant="gold" className="w-full" disabled={!stripe || busy}>
        {busy ? "Processing…" : mode === "authorise" ? "Place card hold" : "Pay now"}
      </Button>
      <p className="text-ink-500 text-xs">
        {mode === "authorise"
          ? "Your card is not charged now. Live Luxe captures the amount only when the request is approved; declined or expired requests release the hold automatically."
          : "The full amount is charged now and the booking confirms as soon as the payment clears."}
      </p>
    </form>
  );
}

/** Stripe's Payment Element is an iframe: it cannot read our CSS variables, so we resolve the roles at mount. */
function stripeVariables() {
  const css = typeof window === "undefined" ? null : getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback;
  return {
    colorPrimary: read("--accent-gold", "rgb(211 172 96)"),
    colorText: read("--text-primary", "rgb(22 36 59)"),
    colorBackground: read("--bg-inset", "rgb(244 239 230)"),
    colorDanger: read("--status-danger-fg", "rgb(180 35 24)"),
    fontFamily: "inherit",
    borderRadius: read("--radius-control", "6px"),
  };
}

export function PaymentForm({ bookingId, returnUrl }: { bookingId: string; returnUrl: string }) {
  const [payload, setPayload] = useState<IntentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/requests/${bookingId}/pay`, { headers: { accept: "application/json" } })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok)
          throw new Error(json?.error?.details?.detail ?? json?.error?.message ?? "Could not start payment.");
        return json as IntentPayload;
      })
      .then((p) => !cancelled && setPayload(p))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const stripePromise = payload?.publishableKey ? stripeJs(payload.publishableKey) : null;

  if (error)
    return (
      <p role="alert" className="border-danger-border bg-danger-bg text-danger-fg rounded-md border px-3 py-2 text-sm">
        {error}
      </p>
    );
  if (!payload || !stripePromise) return <p className="text-ink-500 text-sm">Loading secure payment form…</p>;
  if (!payload.clientSecret)
    return (
      <p className="text-ink-700 text-sm">
        {payload.state === "captured"
          ? "This request is already paid."
          : "A card hold is already in place for this request."}
      </p>
    );

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: payload.clientSecret,
        appearance: {
          theme: "stripe",
          variables: stripeVariables(),
        },
      }}
    >
      <CheckoutForm returnUrl={returnUrl} mode={payload.mode} />
    </Elements>
  );
}
