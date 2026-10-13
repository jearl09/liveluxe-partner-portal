/**
 * In-memory Stripe with the object lifecycles the platform relies on:
 * PaymentIntents (manual capture, partial capture, cancel, network expiry),
 * Refunds, Invoices + items + credit notes, Customers, Disputes and balance
 * transactions. Every mutating call honours the idempotency key exactly as
 * Stripe does (same key → same result), and failures can be injected per call
 * (card declines, API outage) to drive the §17.2 scenarios.
 */
import type Stripe from "stripe";

export class FakeStripeError extends Error {
  constructor(
    public type: string,
    message: string,
    public code?: string,
    public decline_code?: string,
  ) {
    super(message);
    this.name = "StripeError";
  }
}

type Obj = Record<string, unknown>;
let seq = 1000;
const id = (p: string) => `${p}_${(seq++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clone = <T>(x: T): T => structuredClone(x);
const now = () => Math.floor(Date.now() / 1000);

export class FakeStripe {
  /** Object stores (the API namespaces below share these names, so the stores live here). */
  store = {
    pis: new Map<string, Obj>(),
    charges: new Map<string, Obj>(),
    refunds: new Map<string, Obj>(),
    invoices: new Map<string, Obj>(),
    invoiceItems: new Map<string, Obj>(),
    creditNotes: new Map<string, Obj>(),
    customers: new Map<string, Obj>(),
    disputes: new Map<string, Obj>(),
  };
  get pis() {
    return this.store.pis;
  }
  get disputeStore() {
    return this.store.disputes;
  }
  balanceTxns: Obj[] = [];
  idem = new Map<string, Obj>();
  calls: { method: string; args: unknown[] }[] = [];
  /** Observer for a cross-system timeline (ordering assertions). */
  onCall: ((method: string) => void) | null = null;
  /** When true every API call throws StripeConnectionError (§17.2 "Stripe outage"). */
  outage = false;
  /** Next capture fails with this card error, then resets. */
  failNextCapture: { code: string; message: string } | null = null;
  failNextRefund: { type: string; message: string } | null = null;
  invoiceSeq = 1;

  reset() {
    for (const m of [...Object.values(this.store), this.idem]) m.clear();
    this.balanceTxns = [];
    this.calls = [];
    this.outage = false;
    this.failNextCapture = null;
    this.failNextRefund = null;
    this.invoiceSeq = 1;
  }

  private guard(method: string, args: unknown[]) {
    this.calls.push({ method, args });
    this.onCall?.(method);
    if (this.outage)
      throw new FakeStripeError("StripeConnectionError", "An error occurred with our connection to Stripe.");
  }
  private withIdem<T extends object>(opts: { idempotencyKey?: string } | undefined, compute: () => T): T {
    const key = opts?.idempotencyKey;
    if (key && this.idem.has(key)) return clone(this.idem.get(key) as unknown as T);
    const result = compute();
    if (key) this.idem.set(key, clone(result) as unknown as Obj);
    return clone(result);
  }

  // --- PaymentIntents -------------------------------------------------------
  paymentIntents = {
    create: async (params: Stripe.PaymentIntentCreateParams, opts?: { idempotencyKey?: string }) => {
      this.guard("paymentIntents.create", [params]);
      return this.withIdem(opts, () => {
        const pi: Obj = {
          id: id("pi"),
          object: "payment_intent",
          amount: params.amount,
          amount_capturable: 0,
          amount_received: 0,
          currency: params.currency,
          customer: params.customer ?? null,
          capture_method: params.capture_method ?? "automatic",
          status: "requires_payment_method",
          client_secret: `${id("pi")}_secret`,
          metadata: { ...(params.metadata ?? {}) },
          payment_method_types: ["card"],
          latest_charge: null,
          last_payment_error: null,
          cancellation_reason: null,
          created: now(),
        };
        this.pis.set(pi.id as string, pi);
        return pi;
      });
    },
    retrieve: async (piId: string) => {
      this.guard("paymentIntents.retrieve", [piId]);
      const pi = this.pis.get(piId);
      if (!pi)
        throw new FakeStripeError("StripeInvalidRequestError", `No such payment_intent: ${piId}`, "resource_missing");
      return this.expandPi(pi);
    },
    capture: async (piId: string, params?: { amount_to_capture?: number }, opts?: { idempotencyKey?: string }) => {
      this.guard("paymentIntents.capture", [piId, params]);
      return this.withIdem(opts, () => {
        const pi = this.pis.get(piId);
        if (!pi)
          throw new FakeStripeError("StripeInvalidRequestError", `No such payment_intent: ${piId}`, "resource_missing");
        if (pi.status === "succeeded") return this.expandPi(pi);
        if (pi.status !== "requires_capture")
          throw new FakeStripeError(
            "StripeInvalidRequestError",
            `This PaymentIntent (${piId}) could not be captured because it has a status of ${pi.status}.`,
          );
        if (this.failNextCapture) {
          const f = this.failNextCapture;
          this.failNextCapture = null;
          throw new FakeStripeError("StripeCardError", f.message, f.code, f.code);
        }
        const amount = Math.min(params?.amount_to_capture ?? (pi.amount as number), pi.amount_capturable as number);
        pi.status = "succeeded";
        pi.amount_received = amount;
        pi.amount_capturable = 0;
        const ch = this.store.charges.get(pi.latest_charge as string)!;
        ch.captured = true;
        ch.amount_captured = amount;
        ch.status = "succeeded";
        this.balanceTxns.push(this.txn("charge", amount, ch));
        return this.expandPi(pi);
      });
    },
    cancel: async (piId: string, params?: { cancellation_reason?: string }, opts?: { idempotencyKey?: string }) => {
      this.guard("paymentIntents.cancel", [piId, params]);
      return this.withIdem(opts, () => {
        const pi = this.pis.get(piId);
        if (!pi)
          throw new FakeStripeError("StripeInvalidRequestError", `No such payment_intent: ${piId}`, "resource_missing");
        if (pi.status === "canceled") return this.expandPi(pi);
        if (pi.status === "succeeded")
          throw new FakeStripeError(
            "StripeInvalidRequestError",
            "You cannot cancel this PaymentIntent because it has a status of succeeded.",
          );
        pi.status = "canceled";
        pi.amount_capturable = 0;
        pi.cancellation_reason = params?.cancellation_reason ?? null;
        return this.expandPi(pi);
      });
    },
  };

  private expandPi(pi: Obj): Stripe.PaymentIntent & Obj {
    const out = clone(pi);
    if (typeof out.latest_charge === "string") out.latest_charge = clone(this.store.charges.get(out.latest_charge));
    return out as unknown as Stripe.PaymentIntent & Obj;
  }

  /** Test helper: the partner completes the Payment Element. */
  confirmCard(
    piId: string,
    outcome: "success" | "decline" | "3ds" | "abandon" = "success",
    card = { brand: "visa", last4: "4242" },
  ) {
    const pi = this.pis.get(piId)!;
    if (outcome === "3ds" || outcome === "abandon") {
      pi.status = "requires_action";
      return clone(pi);
    }
    if (outcome === "decline") {
      pi.status = "requires_payment_method";
      pi.last_payment_error = {
        code: "card_declined",
        decline_code: "insufficient_funds",
        message: "Your card has insufficient funds.",
      };
      return clone(pi);
    }
    const ch: Obj = {
      id: id("ch"),
      object: "charge",
      payment_intent: pi.id,
      amount: pi.amount,
      amount_captured: 0,
      amount_refunded: 0,
      captured: false,
      status: "succeeded",
      payment_method_details: { type: "card", card: { brand: card.brand, last4: card.last4 } },
    };
    this.store.charges.set(ch.id as string, ch);
    pi.latest_charge = ch.id;
    pi.last_payment_error = null;
    if (pi.capture_method === "manual") {
      pi.status = "requires_capture";
      pi.amount_capturable = pi.amount;
    } else {
      pi.status = "succeeded";
      pi.amount_received = pi.amount;
      ch.captured = true;
      ch.amount_captured = pi.amount;
      this.balanceTxns.push(this.txn("charge", pi.amount as number, ch));
    }
    return clone(pi);
  }

  /** Test helper: the card network releases an uncaptured authorisation (§11.4). */
  expireAuthorisation(piId: string) {
    const pi = this.pis.get(piId)!;
    pi.status = "canceled";
    pi.amount_capturable = 0;
    pi.cancellation_reason = "automatic";
    return clone(pi);
  }

  // --- Refunds ----------------------------------------------------------------
  refunds = {
    create: async (params: Stripe.RefundCreateParams, opts?: { idempotencyKey?: string }) => {
      this.guard("refunds.create", [params]);
      return this.withIdem(opts, () => {
        if (this.failNextRefund) {
          const f = this.failNextRefund;
          this.failNextRefund = null;
          throw new FakeStripeError(f.type, f.message);
        }
        const pi = this.pis.get(params.payment_intent as string);
        if (!pi || pi.status !== "succeeded")
          throw new FakeStripeError(
            "StripeInvalidRequestError",
            "This PaymentIntent has no captured charge to refund.",
          );
        const ch = this.store.charges.get(pi.latest_charge as string)!;
        const amount = params.amount ?? (ch.amount_captured as number) - (ch.amount_refunded as number);
        if (amount > (ch.amount_captured as number) - (ch.amount_refunded as number))
          throw new FakeStripeError(
            "StripeInvalidRequestError",
            "Refund amount exceeds the charge's remaining balance.",
            "amount_too_large",
          );
        const r: Obj = {
          id: id("re"),
          object: "refund",
          amount,
          charge: ch.id,
          payment_intent: pi.id,
          status: "succeeded",
          reason: params.reason ?? null,
          failure_reason: null,
          metadata: { ...(params.metadata ?? {}) },
          created: now(),
        };
        ch.amount_refunded = (ch.amount_refunded as number) + amount;
        this.store.refunds.set(r.id as string, r);
        this.balanceTxns.push(this.txn("refund", -amount, r));
        return r;
      });
    },
    retrieve: async (rid: string) => {
      this.guard("refunds.retrieve", [rid]);
      return clone(this.store.refunds.get(rid)) as unknown as Stripe.Refund;
    },
    list: async (params: { charge?: string; payment_intent?: string }) => {
      this.guard("refunds.list", [params]);
      const data = [...this.store.refunds.values()].filter(
        (r) =>
          (!params.charge || r.charge === params.charge) &&
          (!params.payment_intent || r.payment_intent === params.payment_intent),
      );
      return { data: clone(data) } as unknown as Stripe.ApiList<Stripe.Refund>;
    },
  };

  // --- Invoices ---------------------------------------------------------------
  invoices = {
    create: async (params: Stripe.InvoiceCreateParams, opts?: { idempotencyKey?: string }) => {
      this.guard("invoices.create", [params]);
      return this.withIdem(opts, () => {
        const inv: Obj = {
          id: id("in"),
          object: "invoice",
          customer: params.customer,
          status: "draft",
          number: null,
          amount_due: 0,
          amount_paid: 0,
          currency: params.currency ?? "aud",
          collection_method: params.collection_method ?? "charge_automatically",
          due_date: params.due_date ?? (params.days_until_due ? now() + params.days_until_due * 86_400 : null),
          hosted_invoice_url: null,
          invoice_pdf: null,
          metadata: { ...(params.metadata ?? {}) },
          custom_fields: params.custom_fields ?? null,
          status_transitions: { paid_at: null },
          lines: [],
          attempt_count: 0,
        };
        this.store.invoices.set(inv.id as string, inv);
        return inv;
      });
    },
    retrieve: async (invId: string) => {
      this.guard("invoices.retrieve", [invId]);
      const inv = this.store.invoices.get(invId);
      if (!inv) throw new FakeStripeError("StripeInvalidRequestError", `No such invoice: ${invId}`, "resource_missing");
      return clone(inv) as unknown as Stripe.Invoice;
    },
    finalizeInvoice: async (invId: string, _p?: unknown, opts?: { idempotencyKey?: string }) => {
      this.guard("invoices.finalizeInvoice", [invId]);
      return this.withIdem(opts, () => {
        const inv = this.store.invoices.get(invId)!;
        if (inv.status === "draft") {
          inv.status = "open";
          inv.number = `LL-${String(this.invoiceSeq++).padStart(4, "0")}`;
          inv.amount_due = (inv.lines as Obj[]).reduce((s, l) => s + (l.amount as number), 0);
          inv.hosted_invoice_url = `https://invoice.stripe.test/${inv.id}`;
          inv.invoice_pdf = `https://invoice.stripe.test/${inv.id}/pdf`;
        }
        return inv;
      });
    },
    sendInvoice: async (invId: string, _p?: unknown, opts?: { idempotencyKey?: string }) => {
      this.guard("invoices.sendInvoice", [invId]);
      return this.withIdem(opts, () => this.store.invoices.get(invId)!);
    },
    pay: async (invId: string, params?: { paid_out_of_band?: boolean }, opts?: { idempotencyKey?: string }) => {
      this.guard("invoices.pay", [invId, params]);
      return this.withIdem(opts, () => {
        const inv = this.store.invoices.get(invId)!;
        if (inv.status === "open") {
          inv.status = "paid";
          inv.amount_paid = inv.amount_due;
          (inv.status_transitions as Obj).paid_at = now();
        }
        return inv;
      });
    },
    voidInvoice: async (invId: string, _p?: unknown, opts?: { idempotencyKey?: string }) => {
      this.guard("invoices.voidInvoice", [invId]);
      return this.withIdem(opts, () => {
        const inv = this.store.invoices.get(invId)!;
        inv.status = "void";
        return inv;
      });
    },
  };
  invoiceItems = {
    create: async (params: Stripe.InvoiceItemCreateParams, opts?: { idempotencyKey?: string }) => {
      this.guard("invoiceItems.create", [params]);
      return this.withIdem(opts, () => {
        const item: Obj = {
          id: id("ii"),
          amount: params.amount,
          description: params.description,
          invoice: params.invoice,
        };
        this.store.invoiceItems.set(item.id as string, item);
        (this.store.invoices.get(params.invoice as string)!.lines as Obj[]).push(item);
        return item;
      });
    },
  };
  creditNotes = {
    create: async (params: Stripe.CreditNoteCreateParams, opts?: { idempotencyKey?: string }) => {
      this.guard("creditNotes.create", [params]);
      return this.withIdem(opts, () => {
        const inv = this.store.invoices.get(params.invoice)!;
        const amount =
          params.credit_amount ??
          params.out_of_band_amount ??
          (params.lines ?? []).reduce((s, l) => s + ((l as { unit_amount?: number }).unit_amount ?? 0), 0);
        const cn: Obj = {
          id: id("cn"),
          object: "credit_note",
          invoice: inv.id,
          amount,
          status: "issued",
          memo: params.memo ?? null,
        };
        this.store.creditNotes.set(cn.id as string, cn);
        if (params.credit_amount) inv.amount_due = (inv.amount_due as number) - params.credit_amount;
        return cn;
      });
    },
  };
  customers = {
    create: async (params: Stripe.CustomerCreateParams, opts?: { idempotencyKey?: string }) => {
      this.guard("customers.create", [params]);
      return this.withIdem(opts, () => {
        const c: Obj = {
          id: id("cus"),
          object: "customer",
          name: params.name,
          email: params.email ?? null,
          metadata: { ...(params.metadata ?? {}) },
        };
        this.store.customers.set(c.id as string, c);
        return c;
      });
    },
  };
  balanceTransactions = {
    list: (params: { created?: { gte?: number; lte?: number } }) => {
      this.guard("balanceTransactions.list", [params]);
      const data = this.balanceTxns.filter(
        (t) =>
          (!params.created?.gte || (t.created as number) >= params.created.gte) &&
          (!params.created?.lte || (t.created as number) <= params.created.lte),
      );
      const expanded = clone(data);
      const p = Promise.resolve({ data: expanded }) as unknown as Stripe.ApiListPromise<Stripe.BalanceTransaction>;
      (p as unknown as { [Symbol.asyncIterator]: () => AsyncIterator<unknown> })[Symbol.asyncIterator] =
        async function* () {
          for (const t of expanded) yield t;
        };
      return p;
    },
  };

  /** Test helper: Stripe pays an open invoice (card/BECS on the hosted page). */
  payInvoice(invId: string) {
    const inv = this.store.invoices.get(invId)!;
    inv.status = "paid";
    inv.amount_paid = inv.amount_due;
    (inv.status_transitions as Obj).paid_at = now();
    this.balanceTxns.push(
      this.txn("payment", inv.amount_due as number, { id: id("py"), object: "charge", payment_intent: null }),
    );
    return clone(inv);
  }
  failInvoicePayment(invId: string) {
    const inv = this.store.invoices.get(invId)!;
    inv.attempt_count = (inv.attempt_count as number) + 1;
    return clone(inv);
  }
  /** Test helper: the cardholder disputes the charge. */
  openDispute(piId: string, reason = "fraudulent") {
    const pi = this.pis.get(piId)!;
    const d: Obj = {
      id: id("du"),
      object: "dispute",
      amount: pi.amount_received,
      currency: pi.currency,
      charge: pi.latest_charge,
      payment_intent: pi.id,
      reason,
      status: "needs_response",
      created: now(),
    };
    this.store.disputes.set(d.id as string, d);
    this.balanceTxns.push(this.txn("dispute", -(d.amount as number), d));
    return clone(d);
  }
  closeDispute(disputeId: string, status: "won" | "lost") {
    const d = this.store.disputes.get(disputeId)!;
    d.status = status;
    return clone(d);
  }

  private txn(type: string, amount: number, source: Obj): Obj {
    const fee = type === "charge" || type === "payment" ? Math.round(amount * 0.0175 + 30) : 0;
    return {
      id: id("txn"),
      object: "balance_transaction",
      type,
      amount,
      fee,
      net: amount - fee,
      currency: "aud",
      created: now(),
      source: clone(source),
      description: `${type} ${source.id}`,
    };
  }

  /** Build a webhook event for an object as Stripe would deliver it. */
  event<T extends Obj>(type: string, object: T): Stripe.Event {
    return {
      id: id("evt"),
      object: "event",
      type,
      created: now(),
      data: { object: clone(object) },
      livemode: false,
      api_version: "2025-01-01",
      pending_webhooks: 1,
      request: null,
    } as unknown as Stripe.Event;
  }
  pi(piId: string) {
    return clone(this.pis.get(piId)!);
  }
  invoice(invId: string) {
    return clone(this.store.invoices.get(invId)!);
  }
}
