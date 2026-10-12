/**
 * Partner organisation form rules (spec §2.2, §13.4 "Partners"). Pure validation
 * for the create/update screen; business tunables left blank fall back to the
 * settings table at request time.
 */

export const PARTNER_TYPES = ["insurance", "corporate", "government", "other"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export const ORG_STATUSES = ["active", "suspended", "pending", "closed"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  insurance: "Insurance",
  corporate: "Corporate",
  government: "Government",
  other: "Other",
};

export const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  pending: "Pending",
  closed: "Closed",
};

/** Field names the create/edit form posts. */
export const ORG_FORM_FIELDS = [
  "name",
  "type",
  "status",
  "abn",
  "slaHours",
  "billingContactName",
  "billingEmail",
  "emailDomains",
  "requireClaimRef",
  "requirePoNumber",
] as const;

export interface PartnerOrgFormValues {
  name: string;
  type: PartnerType;
  status: OrgStatus;
  abn: string | null;
  billingEmail: string | null;
  billingContactName: string | null;
  requireClaimRef: boolean;
  requirePoNumber: boolean;
  /** Decision SLA in business hours; null = global default. */
  slaHours: number | null;
  /** Comma-separated in the form; stored as an array. */
  emailDomains: string[];
}

export type PartnerOrgFormResult =
  { ok: true; values: PartnerOrgFormValues } | { ok: false; errors: Record<string, string[]> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function parsePartnerOrgForm(raw: Record<string, string | undefined>): PartnerOrgFormResult {
  const errors: Record<string, string[]> = {};
  const add = (f: string, m: string) => (errors[f] ??= []).push(m);
  const opt = (v: string | undefined) => {
    const t = (v ?? "").trim();
    return t ? t : null;
  };

  const name = (raw.name ?? "").trim();
  if (name.length < 2 || name.length > 120) add("name", "Organisation name must be 2–120 characters.");

  const type = (raw.type ?? "") as PartnerType;
  if (!PARTNER_TYPES.includes(type)) add("type", "Choose a partner type.");

  const status = ((raw.status ?? "active") || "active") as OrgStatus;
  if (!ORG_STATUSES.includes(status)) add("status", "Unknown status.");

  const abn = opt(raw.abn)?.replace(/\s+/g, "") ?? null;
  if (abn && !/^\d{11}$/.test(abn)) add("abn", "An ABN is 11 digits.");

  const billingEmail = opt(raw.billingEmail)?.toLowerCase() ?? null;
  if (billingEmail && !EMAIL.test(billingEmail)) add("billingEmail", "Enter a valid billing email.");

  const slaRaw = opt(raw.slaHours);
  let slaHours: number | null = null;
  if (slaRaw) {
    const n = Number(slaRaw);
    if (!Number.isFinite(n) || n <= 0 || n > 72) add("slaHours", "SLA must be between 0 and 72 business hours.");
    else slaHours = n;
  }

  const emailDomains = (raw.emailDomains ?? "")
    .split(/[,\s]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  for (const d of emailDomains) if (!DOMAIN.test(d)) add("emailDomains", `"${d}" is not a domain (e.g. nrma.com.au).`);

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    values: {
      name,
      type,
      status,
      abn,
      billingEmail,
      billingContactName: opt(raw.billingContactName),
      requireClaimRef: raw.requireClaimRef === "on" || raw.requireClaimRef === "true",
      requirePoNumber: raw.requirePoNumber === "on" || raw.requirePoNumber === "true",
      slaHours,
      emailDomains: [...new Set(emailDomains)],
    },
  };
}
