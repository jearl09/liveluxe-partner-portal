"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A labelled password box with a show/hide toggle (brief §6.2). The toggle is a real button with its state in
 * words. The label points at the input with htmlFor rather than wrapping it, so the button's name never joins
 * the field's accessible name ("Password", not "Password Show password").
 */
export function PasswordInput({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const [shown, setShown] = useState(false);
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = [props["aria-describedby"], hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="block text-sm">
      <label htmlFor={id} className="mb-1 block font-medium">
        {label}
      </label>
      <span className="relative block">
        <input
          {...props}
          id={id}
          aria-describedby={describedBy}
          type={shown ? "text" : "password"}
          className={cn(className, "pr-12")}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          className="text-text-muted hover:text-text-primary rounded-control focus-visible:outline-focus absolute inset-y-0 right-1 my-auto inline-flex h-9 w-10 items-center justify-center focus-visible:outline-2"
        >
          {shown ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </span>
      {hint && (
        <span id={hintId} className="text-muted-foreground mt-1 block text-xs">
          {hint}
        </span>
      )}
    </div>
  );
}
