import { PASSWORD_POLICY } from "@/lib/domain/auth";
import { inputClass } from "./notice";

/** New-password pair used by invite acceptance and password reset. */
export function PasswordFields({ autoFocus = false }: { autoFocus?: boolean }) {
  return (
    <>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">New password</span>
        <input
          name="password"
          type="password"
          required
          minLength={PASSWORD_POLICY.minLength}
          maxLength={PASSWORD_POLICY.maxLength}
          autoComplete="new-password"
          autoFocus={autoFocus}
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-zinc-500">
          At least {PASSWORD_POLICY.minLength} characters. It is checked against known data breaches.
        </span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Confirm password</span>
        <input name="confirm" type="password" required autoComplete="new-password" className={inputClass} />
      </label>
    </>
  );
}
