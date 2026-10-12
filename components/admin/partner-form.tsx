import { SubmitButton } from "@/components/ui/submit-button";
import { ORG_STATUS_LABELS, ORG_STATUSES, PARTNER_TYPE_LABELS, PARTNER_TYPES } from "@/lib/domain/partners";
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
    <form method="post" action={action} className="space-y-4">
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
