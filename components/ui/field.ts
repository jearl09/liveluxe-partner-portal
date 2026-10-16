import { cn } from "@/lib/utils";

/**
 * Form field classes, in one place (§13.5).
 *
 * The look of every text input, select and textarea — surface, border, radius, the
 * 44 px height, focus ring — belongs to the base layer in app/globals.css, so a field
 * only has to say how wide it is. Seven files used to carry their own copy of that
 * string; when the theme changed, each was a chance to drift.
 */
export const fieldClass = "w-full";

/** The small label above a field. Wrap the control in it so the label is its accessible name. */
export const labelClass = "text-text-primary text-body-sm block font-semibold";

/** Added to a field the server sent back as invalid; pair it with `aria-invalid`. */
export const invalidFieldClass = "border-bad-border ring-bad-border ring-1";

/** `fieldClass` plus the top gap under a label, plus the invalid ring when the server flagged it. */
export const fieldClasses = (invalid = false, extra?: string) =>
  cn(fieldClass, "mt-1", invalid && invalidFieldClass, extra);

/** Inline message under an invalid field. */
export const fieldErrorClass = "text-danger-fg text-body-sm mt-1 block font-normal";
