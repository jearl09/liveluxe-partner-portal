import { describe, expect, it } from "vitest";
import { parsePartnerOrgForm } from "@/lib/domain/partners";

describe("parsePartnerOrgForm", () => {
  it("accepts a full form and normalises values", () => {
    const r = parsePartnerOrgForm({
      name: "  NRMA Insurance ",
      type: "insurance",
      status: "active",
      abn: "12 345 678 901",
      billingEmail: "AP@NRMA.com.au",
      billingContactName: "Accounts Payable",
      requireClaimRef: "on",
      requirePoNumber: "",
      slaHours: "2",
      emailDomains: "nrma.com.au, @iag.com.au nrma.com.au",
      paymentTerms: "net30",
      creditLimit: "$250,000",
      depositPct: "25%",
      financeContactEmail: "Finance@LiveLuxe.test",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toEqual({
      name: "NRMA Insurance",
      type: "insurance",
      status: "active",
      abn: "12345678901",
      billingEmail: "ap@nrma.com.au",
      billingContactName: "Accounts Payable",
      requireClaimRef: true,
      requirePoNumber: false,
      slaHours: 2,
      paymentTerms: "net30",
      creditLimitCents: 25_000_000,
      depositPct: 25,
      financeContactEmail: "finance@liveluxe.test",
      emailDomains: ["nrma.com.au", "iag.com.au"],
    });
  });

  it("rejects a deposit outside 1–100 and a malformed finance contact", () => {
    const r = parsePartnerOrgForm({ name: "Acme", type: "corporate", depositPct: "150", financeContactEmail: "nope" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["depositPct", "financeContactEmail"]);
  });

  it("defaults status to active and blanks to null", () => {
    const r = parsePartnerOrgForm({ name: "Acme", type: "corporate" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.status).toBe("active");
      expect(r.values.abn).toBeNull();
      expect(r.values.slaHours).toBeNull();
      expect(r.values.emailDomains).toEqual([]);
      expect(r.values.paymentTerms).toBe("prepay");
      expect(r.values.creditLimitCents).toBeNull();
    }
  });

  it("reports each invalid field", () => {
    const r = parsePartnerOrgForm({
      name: "A",
      type: "charity",
      status: "weird",
      abn: "123",
      billingEmail: "not-an-email",
      slaHours: "100",
      emailDomains: "nrma",
      paymentTerms: "cash",
      creditLimit: "-5",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      [
        "abn",
        "billingEmail",
        "creditLimit",
        "emailDomains",
        "name",
        "paymentTerms",
        "slaHours",
        "status",
        "type",
      ].sort(),
    );
  });
});
