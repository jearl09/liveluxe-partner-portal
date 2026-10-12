import { describe, expect, it } from "vitest";
import {
  clampPage,
  hasActiveFilters,
  ilikePattern,
  listQueryString,
  pageCount,
  pageRange,
  paginate,
  parseListParams,
  toPage,
} from "@/lib/domain/list-params";

const ORG = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";

describe("parseListParams", () => {
  it("returns defaults for an empty query", () => {
    expect(parseListParams({})).toEqual({ band: null, orgId: null, q: "", page: 1, pageSize: 25 });
  });

  it("accepts valid values and takes the first of a repeated key", () => {
    expect(
      parseListParams({ band: ["breached", "on_track"], orgId: ORG, q: "  LLX-2026 ", page: "3", pageSize: "50" }),
    ).toEqual({ band: "breached", orgId: ORG, q: "LLX-2026", page: 3, pageSize: 50 });
  });

  it("discards malformed values rather than throwing", () => {
    expect(parseListParams({ band: "none", orgId: "abc", page: "0", pageSize: "7" })).toEqual({
      band: null,
      orgId: null,
      q: "",
      page: 1,
      pageSize: 25,
    });
    expect(parseListParams({ page: "-4" }).page).toBe(1);
    expect(parseListParams({ page: "NaN" }).page).toBe(1);
  });

  it("truncates an over-long search term", () => {
    expect(parseListParams({ q: "x".repeat(200) }).q).toHaveLength(80);
  });
});

describe("listQueryString", () => {
  it("omits defaults so the plain URL stays plain", () => {
    expect(listQueryString({ page: 1, pageSize: 25, q: "", band: null, orgId: null })).toBe("");
  });

  it("prints every non-default value and carries extra keys through", () => {
    const s = listQueryString(
      { band: "at_risk", orgId: ORG, q: "smith", page: 2, pageSize: 100 },
      { status: "DECLINED" },
    );
    const p = new URLSearchParams(s);
    expect(p.get("status")).toBe("DECLINED");
    expect(p.get("band")).toBe("at_risk");
    expect(p.get("orgId")).toBe(ORG);
    expect(p.get("q")).toBe("smith");
    expect(p.get("page")).toBe("2");
    expect(p.get("pageSize")).toBe("100");
  });

  it("round-trips through parseListParams", () => {
    const input = { band: "paused" as const, orgId: ORG, q: "r. whitfield", page: 4, pageSize: 50 as const };
    const back = parseListParams(Object.fromEntries(new URLSearchParams(listQueryString(input))));
    expect(back).toEqual(input);
  });
});

describe("paging helpers", () => {
  it("counts pages with a floor of one", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });

  it("clamps the page to what exists", () => {
    expect(clampPage(99, 30, 25)).toBe(2);
    expect(clampPage(0, 30, 25)).toBe(1);
    expect(clampPage(1, 0, 25)).toBe(1);
  });

  it("produces inclusive zero-based ranges for PostgREST", () => {
    expect(pageRange(1, 25)).toEqual({ from: 0, to: 24 });
    expect(pageRange(3, 50)).toEqual({ from: 100, to: 149 });
  });

  it("builds the envelope with 1-based from/to, and zeros when empty", () => {
    expect(toPage(["a", "b"], 27, 2, 25)).toMatchObject({ total: 27, pages: 2, from: 26, to: 27 });
    expect(toPage([], 0, 1, 25)).toMatchObject({ total: 0, pages: 1, from: 0, to: 0 });
  });

  it("paginates in memory and clamps an out-of-range page", () => {
    const all = Array.from({ length: 60 }, (_, i) => i);
    const p = paginate(all, 9, 25);
    expect(p.page).toBe(3);
    expect(p.rows).toEqual([50, 51, 52, 53, 54, 55, 56, 57, 58, 59]);
    expect(p.from).toBe(51);
    expect(p.to).toBe(60);
  });
});

describe("filters", () => {
  it("knows when any filter is active", () => {
    expect(hasActiveFilters(parseListParams({}))).toBe(false);
    expect(hasActiveFilters(parseListParams({ q: "x" }))).toBe(true);
    expect(hasActiveFilters(parseListParams({ page: "3" }))).toBe(false);
  });

  it("escapes ilike wildcards and strips filter-list separators", () => {
    expect(ilikePattern("50%_off")).toBe("%50\\%\\_off%");
    expect(ilikePattern('a,b(c)"d')).toBe("%a b c  d%");
  });
});
