import { PASSWORD_POLICY } from "@/lib/domain/auth";
import { inputClass } from "./notice";
import { PasswordInput } from "./password-input";

/** New-password pair used by invite acceptance and password reset. */
export function PasswordFields({ autoFocus = false }: { autoFocus?: boolean }) {
  return (
    <>
      <PasswordInput
        label="New password"
        hint={`At least ${PASSWORD_POLICY.minLength} characters. It is checked against known data breaches.`}
        name="password"
        required
        minLength={PASSWORD_POLICY.minLength}
        maxLength={PASSWORD_POLICY.maxLength}
        autoComplete="new-password"
        autoFocus={autoFocus}
        className={inputClass}
      />
      <PasswordInput
        label="Confirm password"
        name="confirm"
        required
        autoComplete="new-password"
        className={inputClass}
      />
    </>
  );
}
