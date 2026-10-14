"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { fieldClasses, fieldErrorClass, labelClass } from "@/components/ui/field";
import { useMarkDirty } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface RoleOption {
  value: string;
  label: string;
  help: string;
}

/**
 * Invite fields (brief §7.8): email, then the role as a radio group with one line each,
 * and a warning before sending when the address is outside the organisation's domain.
 */
export function InviteFields({
  roles,
  domains,
  defaultEmail,
  defaultRole,
  emailInvalid,
}: {
  roles: RoleOption[];
  /** The organisation's email domains ("insurer.com.au"); empty when unknown. */
  domains: string[];
  defaultEmail: string;
  defaultRole: string;
  emailInvalid: boolean;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const markDirty = useMarkDirty();
  const at = email.lastIndexOf("@");
  const theirs =
    at > 0
      ? email
          .slice(at + 1)
          .trim()
          .toLowerCase()
      : "";
  const outside = domains.length > 0 && theirs.includes(".") && !domains.includes(theirs);

  return (
    <>
      <label className={labelClass}>
        <span>
          Email address
          <span className="text-gold ml-0.5" aria-hidden>
            *
          </span>
        </span>
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            markDirty();
          }}
          aria-invalid={emailInvalid || undefined}
          aria-describedby={outside ? "invite-domain-warning" : undefined}
          className={fieldClasses(emailInvalid)}
        />
        {emailInvalid && <span className={fieldErrorClass}>Enter a valid email address.</span>}
      </label>
      {outside && (
        <p
          id="invite-domain-warning"
          role="status"
          className="border-attention-border bg-attention-bg text-text-primary rounded-control text-body-sm flex gap-2 border px-3 py-2"
        >
          <AlertTriangle className="text-attention-fg mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            This address is not at <span className="font-semibold">{domains.join(" or ")}</span>. Check it is someone in
            your organisation before sending.
          </span>
        </p>
      )}
      <fieldset>
        <legend className="text-text-primary text-body-sm font-semibold">
          Role
          <span className="text-gold ml-0.5" aria-hidden>
            *
          </span>
        </legend>
        <div className="mt-2 space-y-2">
          {roles.map((r) => (
            <label
              key={r.value}
              className={cn(
                "border-subtle rounded-control hover:bg-inset has-[:checked]:border-gold has-[:checked]:bg-inset flex cursor-pointer items-start gap-3 border px-3 py-2.5",
              )}
            >
              <input
                type="radio"
                name="role"
                value={r.value}
                required
                defaultChecked={r.value === defaultRole}
                onChange={markDirty}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="text-text-primary block font-semibold">{r.label}</span>
                <span className="text-text-secondary text-body-sm block">{r.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
