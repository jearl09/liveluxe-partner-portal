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
      emailDomains: ["nrma.com.au", "iag.com.au"],
    });
  });

  it("defaults status to active and blanks to null", () => {
    const r = parsePartnerOrgForm({ name: "Acme", type: "corporate" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.status).toBe("active");
      expect(r.values.abn).toBeNull();
      expect(r.values.slaHours).toBeNull();
      expect(r.values.emailDomains).toEqual([]);
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
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      ["abn", "billingEmail", "emailDomains", "name", "slaHours", "status", "type"].sort(),
    );
  });
});
