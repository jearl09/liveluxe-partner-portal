"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { fieldClasses, fieldErrorClass, labelClass } from "@/components/ui/field";
import { FlowSteps } from "@/components/requests/flow-steps";

const DRAFT_FIELDS = ["guestName", "guestEmail", "guestPhone", "claimRef", "poNumber", "costCentre", "notes"] as const;
type DraftField = (typeof DRAFT_FIELDS)[number];

const HINTS: Record<string, string> = {
  guestName: "Enter the guest's name.",
  guestEmail: "Enter a valid email address, or leave it blank.",
  claimRef: "Your organisation requires a claim reference.",
  poNumber: "Your organisation requires a PO number.",
  acceptTerms: "Tick the confirmation to send the request.",
};

const LABELS: Record<DraftField, string> = {
  guestName: "Guest",
  guestEmail: "Guest email",
  guestPhone: "Guest phone",
  claimRef: "Claim reference",
  poNumber: "PO number",
  costCentre: "Cost centre",
  notes: "Notes for Live Luxe",
};

const req = (
  <span className="text-gold ml-0.5" aria-hidden>
    *
  </span>
);

/**
 * The request form in two steps (brief §7.5): guest and references, then review and
 * send. One ordinary form posts to /api/requests as before; the steps only change
 * what is on screen. Drafts are kept in this browser (never the server) so a timeout
 * or a closed tab loses nothing, and are cleared once the request is sent.
 */
export function RequestForm({
  hidden,
  values,
  errorFields,
  rules,
  orgName,
  canSend,
  withCard,
  payLine,
  draftKey,
  review,
}: {
  hidden: Record<string, string>;
  values: Partial<Record<DraftField | "acceptTerms", string>>;
  errorFields: string[];
  rules: { claimRequired: boolean; poRequired: boolean };
  orgName: string;
  canSend: boolean;
  withCard: boolean;
  payLine: string;
  draftKey: string;
  /** The stay and quote, rendered on the server. */
  review: ReactNode;
}) {
  const bounced = errorFields.length > 0;
  const onlyTerms = bounced && errorFields.every((f) => f === "acceptTerms");
  const [step, setStep] = useState<0 | 1>(onlyTerms ? 1 : 0);
  const [summary, setSummary] = useState<Partial<Record<DraftField, string>>>({});
  const restoredNote = useRef<HTMLParagraphElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const stepOne = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const read = () => {
    const out: Partial<Record<DraftField, string>> = {};
    const el = form.current;
    if (!el) return out;
    for (const f of DRAFT_FIELDS) {
      const input = el.elements.namedItem(f) as HTMLInputElement | HTMLTextAreaElement | null;
      if (input) out[f] = input.value.trim();
    }
    return out;
  };

  // Restore a draft on a fresh visit (a server bounce already carries the values).
  useEffect(() => {
    if (bounced) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<Record<DraftField, string>>;
      const el = form.current;
      let any = false;
      for (const f of DRAFT_FIELDS) {
        const input = el?.elements.namedItem(f) as HTMLInputElement | HTMLTextAreaElement | null;
        if (input && draft[f] && !input.value) {
          input.value = draft[f]!;
          any = true;
        }
      }
      // Shown by the DOM, not state: restoring is a one-off sync with browser storage.
      if (any && restoredNote.current) restoredNote.current.hidden = false;
    } catch {
      /* storage blocked: nothing to restore */
    }
  }, [bounced, draftKey]);

  const save = () => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(read()));
    } catch {
      /* storage blocked or full: the form still works */
    }
  };

  const toReview = () => {
    const box = stepOne.current;
    if (!box) return;
    for (const input of box.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
      if (!input.checkValidity()) {
        input.reportValidity();
        return;
      }
    }
    setSummary(read());
    setStep(1);
    requestAnimationFrame(() => heading.current?.focus());
  };

  const field = (name: DraftField) => ({
    name,
    defaultValue: values[name] ?? "",
    "aria-invalid": errorFields.includes(name) || undefined,
    className: fieldClasses(errorFields.includes(name)),
  });
  const err = (name: string) => errorFields.includes(name) && <span className={fieldErrorClass}>{HINTS[name]}</span>;

  return (
    <form
      ref={form}
      method="post"
      action="/api/requests"
      onInput={save}
      onSubmit={() => {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* ignore */
        }
      }}
      className="space-y-5"
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <FlowSteps current={step} withCard={withCard} />

      {/* Step 1 stays mounted while reviewing, so every value still posts. */}
      <div ref={stepOne} hidden={step !== 0} className="border-subtle bg-surface rounded-card border">
        {
          <p
            ref={restoredNote}
            hidden
            className="border-subtle bg-info-bg text-info-fg text-body-sm flex flex-wrap items-center justify-between gap-2 rounded-t-[inherit] border-b px-5 py-2.5"
          >
            We restored what you typed last time.
            <button
              type="button"
              className="font-semibold underline underline-offset-4"
              onClick={() => {
                for (const f of DRAFT_FIELDS) {
                  const input = form.current?.elements.namedItem(f) as HTMLInputElement | null;
                  if (input) input.value = "";
                }
                try {
                  localStorage.removeItem(draftKey);
                } catch {
                  /* ignore */
                }
                if (restoredNote.current) restoredNote.current.hidden = true;
              }}
            >
              Start blank
            </button>
          </p>
        }
        <fieldset className="space-y-4 px-5 py-5">
          <legend className="text-text-primary text-h3 float-left mb-4 w-full font-semibold">Who is staying</legend>
          <div className="clear-both grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span>Guest name{req}</span>
              <input {...field("guestName")} required maxLength={120} autoComplete="off" />
              {err("guestName")}
            </label>
            <label className={labelClass}>
              Guest email
              <input {...field("guestEmail")} type="email" autoComplete="off" />
              {err("guestEmail")}
            </label>
            <label className={labelClass}>
              Guest phone
              <input {...field("guestPhone")} type="tel" maxLength={40} autoComplete="off" />
            </label>
          </div>
          <p className="text-text-muted text-body-sm">Guest details are shared with Live Luxe only for this stay.</p>
        </fieldset>
        <fieldset className="border-subtle space-y-4 border-t px-5 py-5">
          <legend className="text-text-primary text-h3 float-left mb-4 w-full font-semibold">Your references</legend>
          <div className="clear-both grid gap-4 sm:grid-cols-3">
            <label className={labelClass}>
              <span>
                Claim reference
                {rules.claimRequired ? req : <span className="text-text-muted font-normal"> (optional)</span>}
              </span>
              <input {...field("claimRef")} required={rules.claimRequired} maxLength={60} />
              {err("claimRef")}
            </label>
            <label className={labelClass}>
              <span>
                PO number{rules.poRequired ? req : <span className="text-text-muted font-normal"> (optional)</span>}
              </span>
              <input {...field("poNumber")} required={rules.poRequired} maxLength={60} />
              {err("poNumber")}
            </label>
            <label className={labelClass}>
              <span>
                Cost centre<span className="text-text-muted font-normal"> (optional)</span>
              </span>
              <input {...field("costCentre")} maxLength={60} />
            </label>
          </div>
          <label className={labelClass}>
            <span>
              Notes for Live Luxe<span className="text-text-muted font-normal"> (optional)</span>
            </span>
            <textarea
              {...field("notes")}
              rows={3}
              maxLength={2000}
              placeholder="Access needs, arrival time, anything the team should know"
            />
          </label>
        </fieldset>
        <div className="border-subtle bg-inset flex justify-end rounded-b-[inherit] border-t px-5 py-4">
          <Button type="button" variant="primary" onClick={toReview} className="w-full sm:w-auto">
            Continue to review <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      {step === 1 && (
        <section aria-labelledby="review-heading" className="border-subtle bg-surface rounded-card border">
          <div className="space-y-4 px-5 py-5">
            <h2 id="review-heading" ref={heading} tabIndex={-1} className="outline-none">
              Check and send
            </h2>
            <dl className="border-subtle divide-subtle rounded-control divide-y border">
              {DRAFT_FIELDS.filter((f) => summary[f] || values[f]).map((f) => (
                <div key={f} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[10rem_1fr]">
                  <dt className="text-text-muted text-body-sm">{LABELS[f]}</dt>
                  <dd className="text-text-primary break-words">{summary[f] ?? values[f]}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              onClick={() => setStep(0)}
              className="text-text-primary text-body-sm inline-flex items-center gap-1 font-semibold underline underline-offset-4"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Change these details
            </button>
            <div className="lg:hidden">{review}</div>
            <p className="border-info-border bg-info-bg text-text-primary rounded-control border px-4 py-3">
              {payLine}
            </p>
          </div>
          <div className="border-subtle bg-inset space-y-4 rounded-b-[inherit] border-t px-5 py-5">
            <label className="flex items-start gap-3">
              <input
                name="acceptTerms"
                type="checkbox"
                required
                defaultChecked={values.acceptTerms === "on"}
                className="mt-1 h-5 w-5 shrink-0"
                aria-invalid={errorFields.includes("acceptTerms") || undefined}
              />
              <span className="text-text-primary">
                I confirm the stay and the quoted total, and that this request is made under {orgName}&apos;s agreement
                with Live Luxe.
                {err("acceptTerms")}
              </span>
            </label>
            <SubmitButton variant="primary" className="w-full sm:w-auto" disabled={!canSend} pendingLabel="Sending…">
              {withCard ? "Send request and authorise card" : "Send request"}
            </SubmitButton>
            {!canSend && (
              <p className="text-danger-fg">
                This stay can no longer be priced online for these dates. Go back to the property and choose other
                dates.
              </p>
            )}
          </div>
        </section>
      )}
    </form>
  );
}
