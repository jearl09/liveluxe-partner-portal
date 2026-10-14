import { PASSWORD_POLICY } from "@/lib/domain/auth";
import { inputClass } from "./notice";
import { PasswordInput } from "./password-input";

/** New-password pair used by invite acceptance and password reset. */
export function PasswordFields({ autoFocus = false }: { autoFocus?: boolean }) {
  return (
    <>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">New password</span>
        <PasswordInput
          name="password"
          required
          minLength={PASSWORD_POLICY.minLength}
          maxLength={PASSWORD_POLICY.maxLength}
          autoComplete="new-password"
          autoFocus={autoFocus}
          className={inputClass}
        />
        <span className="text-muted-foreground mt-1 block text-xs">
          At least {PASSWORD_POLICY.minLength} characters. It is checked against known data breaches.
        </span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Confirm password</span>
        <PasswordInput name="confirm" required autoComplete="new-password" className={inputClass} />
      </label>
    </>
  );
}
