import { SubmitButton } from "@/components/ui/submit-button";
import { ORG_STATUS_LABELS, ORG_STATUSES, PARTNER_TYPE_LABELS, PARTNER_TYPES } from "@/lib/domain/partners";
import { PAYMENT_TERMS, PAYMENT_TERMS_LABELS } from "@/lib/domain/payments";
import { fieldClasses, labelClass } from "@/components/ui/field";

/** Create or edit a partner organisation (§13.4 "Partners"). Plain form post; the server validates. */
export function PartnerForm({
  action,
  values,
  errorFields,
  mode,
}: {
  action: string;
  values: Record<string, string>;
  errorFields: Set<string>;
  mode: "create" | "edit";
}) {
  const field = (name: string) => fieldClasses(errorFields.has(name));
  return (
    <form method="post" action={action} className="space-y-4 px-5 py-5">
      {mode === "edit" && <input type="hidden" name="action" value="update" />}
      <div className="grid gap-4 sm:grid-cols-[1fr_180px] sm:items-end">
        <label className={labelClass}>
          Organisation name <span className="text-accent-ink">*</span>
          <input name="name" required maxLength={120} defaultValue={values.name} className={field("name")} />
        </label>
        <label className={labelClass}>
          Type <span className="text-accent-ink">*</span>
          <select name="type" required defaultValue={values.type || "insurance"} className={field("type")}>
            {PARTNER_TYPES.map((t) => (
              <option key={t} value={t}>
                {PARTNER_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
        <label className={labelClass}>
          ABN
          <input name="abn" inputMode="numeric" defaultValue={values.abn} className={field("abn")} />
        </label>
        <label className={labelClass}>
          Decision SLA (business hours)
          <input
            name="slaHours"
            inputMode="decimal"
            placeholder="default"
            defaultValue={values.slaHours}
            className={field("slaHours")}
          />
        </label>
        {mode === "edit" && (
          <label className={labelClass}>
            Status
            <select name="status" defaultValue={values.status || "active"} className={field("status")}>
              {ORG_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ORG_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_220px] sm:items-end">
        <label className={labelClass}>
          Payment terms
          <select name="paymentTerms" defaultValue={values.paymentTerms || "prepay"} className={field("paymentTerms")}>
            {PAYMENT_TERMS.map((t) => (
              <option key={t} value={t}>
                {PAYMENT_TERMS_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Credit limit (AUD, invoice terms)
          <input
            name="creditLimit"
            inputMode="decimal"
            placeholder="no limit"
            defaultValue={values.creditLimit}
            className={field("creditLimit")}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Deposit % (deposit terms)
          <input
            name="depositPct"
            inputMode="numeric"
            placeholder="platform default"
            defaultValue={values.depositPct}
            className={field("depositPct")}
          />
        </label>
        <label className={labelClass}>
          Finance contact email
          <input
            name="financeContactEmail"
            type="email"
            placeholder="named when a booking hits the credit limit"
            defaultValue={values.financeContactEmail}
            className={field("financeContactEmail")}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Billing contact
          <input
            name="billingContactName"
            defaultValue={values.billingContactName}
            className={field("billingContactName")}
          />
        </label>
        <label className={labelClass}>
          Billing email
          <input
            name="billingEmail"
            type="email"
            defaultValue={values.billingEmail}
            className={field("billingEmail")}
          />
        </label>
      </div>

      <label className={labelClass}>
        Email domains (comma separated)
        <input
          name="emailDomains"
          placeholder="nrma.com.au, iag.com.au"
          defaultValue={values.emailDomains}
          className={field("emailDomains")}
        />
        <span className="text-muted-foreground mt-1 block font-normal">
          Used later to warn when an invitation goes outside the partner.
        </span>
      </label>

      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="requireClaimRef"
            defaultChecked={values.requireClaimRef === "on" || values.requireClaimRef === "true"}
            className="accent-gold-500 h-4 w-4"
          />
          Claim reference is mandatory on requests
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="requirePoNumber"
            defaultChecked={values.requirePoNumber === "on" || values.requirePoNumber === "true"}
            className="accent-gold-500 h-4 w-4"
          />
          PO number is mandatory on requests
        </label>
      </div>

      <SubmitButton variant="gold" pendingLabel="Saving…">
        {mode === "create" ? "Create partner" : "Save changes"}
      </SubmitButton>
    </form>
  );
}
