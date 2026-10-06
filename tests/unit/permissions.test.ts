import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CAPABILITIES, PERMISSION_MATRIX, USER_ROLES, can, isLivluxeRole } from "@/lib/domain/permissions";

describe("permission matrix (spec §2.3)", () => {
  it("matches the role_permissions seed in the initial migration exactly", () => {
    const sql = readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20261006000000_initial_schema.sql"),
      "utf8",
    );
    const seedBlock = sql.slice(sql.indexOf("insert into role_permissions"), sql.indexOf("insert into settings"));
    const seeded = new Set<string>();
    for (const m of seedBlock.matchAll(/\('([a-z_]+)','([a-z_.]+)'\)/g)) seeded.add(`${m[1]}:${m[2]}`);

    const inCode = new Set<string>();
    for (const cap of CAPABILITIES)
      for (const role of USER_ROLES) if (PERMISSION_MATRIX[cap][role]) inCode.add(`${role}:${cap}`);

    const onlyInSql = [...seeded].filter((x) => !inCode.has(x));
    const onlyInCode = [...inCode].filter((x) => !seeded.has(x));
    expect({ onlyInSql, onlyInCode }).toEqual({ onlyInSql: [], onlyInCode: [] });
  });

  it("partner roles never hold Livluxe-only capabilities", () => {
    for (const role of USER_ROLES.filter((r) => !isLivluxeRole(r))) {
      expect(can(role, "requests.approve")).toBe(false);
      expect(can(role, "requests.view_all_orgs")).toBe(false);
      expect(can(role, "refunds.issue")).toBe(false);
      expect(can(role, "support.impersonate")).toBe(false);
    }
  });

  it("viewer and finance cannot submit or pay", () => {
    expect(can("partner_viewer", "requests.submit")).toBe(false);
    expect(can("partner_finance", "requests.submit")).toBe(false);
    expect(can("partner_finance", "payments.authorise")).toBe(false);
    expect(can("partner_finance", "invoices.download")).toBe(true);
  });
});
