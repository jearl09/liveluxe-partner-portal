import { describe, expect, it } from "vitest";
import { invoiceStatus, invoiceSummary, type InvoiceFacts } from "@/lib/domain/invoices";

const now = new Date("2026-10-14T03:00:00Z");
const inv = (p: Partial<InvoiceFacts>): InvoiceFacts => ({
  status: "open",
  amount_due_cents: 10000,
  amount_paid_cents: 0,
  due_at: "2026-10-20T00:00:00Z",
  paid_at: null,
  ...p,
});
const month = (iso: string) => iso.slice(0, 7);

describe("invoices (brief §7.7)", () => {
  it("derives Overdue from the due date", () => {
    expect(invoiceStatus(inv({}), now)).toBe("open");
    expect(invoiceStatus(inv({ due_at: "2026-10-01T00:00:00Z" }), now)).toBe("overdue");
    expect(invoiceStatus(inv({ status: "uncollectible" }), now)).toBe("overdue");
    expect(invoiceStatus(inv({ status: "paid" }), now)).toBe("paid");
  });
  it("sums outstanding, overdue and paid this month", () => {
    const s = invoiceSummary(
      [
        inv({ amount_paid_cents: 2500 }),
        inv({ due_at: "2026-10-01T00:00:00Z", amount_due_cents: 4000 }),
        inv({ status: "paid", amount_paid_cents: 900, paid_at: "2026-10-02T00:00:00Z" }),
        inv({ status: "paid", amount_paid_cents: 700, paid_at: "2026-09-30T00:00:00Z" }),
        inv({ status: "void" }),
      ],
      now,
      month,
    );
    expect(s).toEqual({
      outstandingCents: 11500,
      openCount: 2,
      overdueCount: 1,
      overdueCents: 4000,
      paidThisMonthCents: 900,
    });
  });
});
