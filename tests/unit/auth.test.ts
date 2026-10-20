import { describe, it, expect } from "vitest";
import {
  LOGIN_RATE_LIMITS,
  canInvite,
  evaluateInvitation,
  postLoginDestination,
  mfaEnrolmentRequired,
  mfaRequiredForRole,
  mfaStepUpRequired,
  safeRedirectPath,
  totpQrImageSrc,
  validatePassword,
} from "@/lib/domain/auth";

describe("totpQrImageSrc", () => {
  it("passes a Supabase data URL through untouched (double wrapping broke the QR on 20 Oct 2026)", () => {
    const supa = "data:image/svg+xml;utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E";
    expect(totpQrImageSrc(supa)).toBe(supa);
    expect(totpQrImageSrc(` ${supa}\n`)).toBe(supa);
  });
  it("wraps a bare SVG once", () => {
    expect(totpQrImageSrc('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe(
      "data:image/svg+xml;utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    );
  });
});

describe("auth policy (spec §8.1 / §8.2)", () => {
  it("rate limits match the spec: 5 per account and 20 per IP in 15 minutes", () => {
    expect(LOGIN_RATE_LIMITS.perAccount).toEqual({ max: 5, windowSeconds: 900 });
    expect(LOGIN_RATE_LIMITS.perIp).toEqual({ max: 20, windowSeconds: 900 });
  });

  describe("validatePassword", () => {
    it("accepts a long passphrase", () => {
      expect(
        validatePassword("correct horse battery staple", { email: "a@b.com", confirm: "correct horse battery staple" }),
      ).toEqual([]);
    });
    it("rejects short, mismatched and email-derived passwords", () => {
      expect(validatePassword("short", { confirm: "other" })).toEqual(["too_short", "mismatch"]);
      expect(validatePassword("claudia-is-great-2026", { email: "claudia@liveluxeau.com" })).toEqual([
        "contains_email",
      ]);
      expect(validatePassword("x".repeat(129))).toEqual(["too_long"]);
    });
    it("ignores very short local parts so 'ab@x' does not poison every password containing 'ab'", () => {
      expect(validatePassword("absolutely-fine-password", { email: "ab@x.com" })).toEqual([]);
    });
  });

  describe("evaluateInvitation", () => {
    const now = new Date("2026-10-06T00:00:00Z");
    it("is valid before expiry and unaccepted", () => {
      expect(evaluateInvitation({ expiresAt: "2026-10-13T00:00:00Z" }, now)).toBe("valid");
    });
    it("is expired at or after expires_at", () => {
      expect(evaluateInvitation({ expiresAt: now }, now)).toBe("expired");
      expect(evaluateInvitation({ expiresAt: "2026-10-01T00:00:00Z" }, now)).toBe("expired");
    });
    it("accepted wins over expiry", () => {
      expect(evaluateInvitation({ expiresAt: "2026-10-01T00:00:00Z", acceptedAt: "2026-09-30T00:00:00Z" }, now)).toBe(
        "accepted",
      );
    });
  });

  describe("canInvite", () => {
    const org = "org-a";
    it("partner_admin invites partner roles into its own org only", () => {
      expect(canInvite({ role: "partner_admin", orgId: org }, { role: "partner_booker", orgId: org })).toBe(true);
      expect(canInvite({ role: "partner_admin", orgId: org }, { role: "partner_booker", orgId: "org-b" })).toBe(false);
      expect(canInvite({ role: "partner_admin", orgId: org }, { role: "livluxe_ops", orgId: org })).toBe(false);
    });
    it("livluxe_admin invites anyone anywhere; other roles invite nobody", () => {
      expect(canInvite({ role: "livluxe_admin", orgId: "ll" }, { role: "livluxe_ops", orgId: "ll" })).toBe(true);
      expect(canInvite({ role: "livluxe_admin", orgId: "ll" }, { role: "partner_admin", orgId: org })).toBe(true);
      expect(canInvite({ role: "livluxe_ops", orgId: "ll" }, { role: "partner_viewer", orgId: org })).toBe(false);
      expect(canInvite({ role: "partner_booker", orgId: org }, { role: "partner_viewer", orgId: org })).toBe(false);
    });
  });

  describe("safeRedirectPath", () => {
    it("allows same-origin paths and rejects everything else", () => {
      expect(safeRedirectPath("/admin/queue")).toBe("/admin/queue");
      expect(safeRedirectPath("//evil.example")).toBe("/");
      expect(safeRedirectPath("/\\evil.example")).toBe("/");
      expect(safeRedirectPath("https://evil.example")).toBe("/");
      expect(safeRedirectPath(undefined, "/x")).toBe("/x");
    });
  });

  describe("postLoginDestination (MFA mandatory for staff, opt-in for partners; enrolled users get the code prompt)", () => {
    it("partners without a factor go straight to their page", () => {
      expect(mfaStepUpRequired({ aal: "aal1", hasVerifiedFactor: false })).toBe(false);
      expect(
        postLoginDestination({ role: "partner_booker", aal: "aal1", hasVerifiedFactor: false, next: "/search" }),
      ).toBe("/search");
    });
    it("staff without a factor must set one up first (David, 20 Oct 2026)", () => {
      expect(mfaRequiredForRole("livluxe_ops")).toBe(true);
      expect(mfaRequiredForRole("livluxe_admin")).toBe(true);
      expect(mfaRequiredForRole("partner_admin")).toBe(false);
      expect(mfaEnrolmentRequired({ role: "livluxe_ops", hasVerifiedFactor: false })).toBe(true);
      expect(mfaEnrolmentRequired({ role: "livluxe_ops", hasVerifiedFactor: true })).toBe(false);
      expect(mfaEnrolmentRequired({ role: "partner_admin", hasVerifiedFactor: false })).toBe(false);
      expect(postLoginDestination({ role: "livluxe_ops", aal: "aal1", hasVerifiedFactor: false })).toBe(
        "/mfa/enrol?next=%2Fadmin%2Fqueue",
      );
      expect(
        postLoginDestination({ role: "livluxe_admin", aal: "aal1", hasVerifiedFactor: false, next: "/admin/audit" }),
      ).toBe("/mfa/enrol?next=%2Fadmin%2Faudit");
      // Enrolment keeps `next` on the same origin too.
      expect(postLoginDestination({ role: "livluxe_ops", aal: "aal1", hasVerifiedFactor: false, next: "//evil" })).toBe(
        "/mfa/enrol?next=%2Fadmin%2Fqueue",
      );
    });
    it("enrolled users are asked for a code until the session is aal2", () => {
      expect(mfaStepUpRequired({ aal: "aal1", hasVerifiedFactor: true })).toBe(true);
      expect(
        postLoginDestination({ role: "livluxe_admin", aal: "aal1", hasVerifiedFactor: true, next: "/admin/audit" }),
      ).toBe("/mfa/verify?next=%2Fadmin%2Faudit");
      expect(postLoginDestination({ role: "partner_admin", aal: "aal1", hasVerifiedFactor: true })).toBe(
        "/mfa/verify?next=%2F",
      );
      expect(postLoginDestination({ role: "livluxe_admin", aal: "aal2", hasVerifiedFactor: true })).toBe(
        "/admin/queue",
      );
    });
    it("does not let `next` smuggle an external redirect through the MFA step", () => {
      expect(postLoginDestination({ role: "livluxe_ops", aal: "aal1", hasVerifiedFactor: true, next: "//evil" })).toBe(
        "/mfa/verify?next=%2Fadmin%2Fqueue",
      );
    });
  });
});
