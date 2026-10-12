import { Banner } from "@/components/ui/banner";

/**
 * Inline status box for the public auth screens. The same strip the portal uses for
 * outcomes (`Flash`), so a warning reads the same on the sign-in card as on the queue.
 */
export const Notice = Banner;

/** Human-readable copy for the `error` query parameter the auth Route Handlers redirect with. */
export const PASSWORD_ERRORS: Record<string, string> = {
  too_short: "Use at least 12 characters. A short sentence works well.",
  too_long: "Passwords are limited to 128 characters.",
  contains_email: "Your password must not contain your email address.",
  mismatch: "The two passwords do not match.",
  breached: "That password appears in a known data breach and cannot be used. Please choose another.",
  update_failed: "The password could not be saved. Please try again.",
};

/** @deprecated use fieldClass from @/components/ui/field */
export { fieldClass as inputClass } from "@/components/ui/field";
