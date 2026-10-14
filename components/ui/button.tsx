import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Exactly four kinds of button (brief §4.4):
 *   primary      gold fill, navy text — one per view, the thing the visitor came to do
 *   secondary    outlined on surface — supporting actions
 *   tertiary     text only, underlined on hover — cancel, back, in-row actions
 *   destructive  outlined danger; fills danger only inside its confirmation step
 *
 * 40 px tall (44 px tap target on touch via the `coarse` variant), 6 px radius, 15 px
 * sans 600, sentence case. Hover is a quiet tint, press a brief 97 % scale, focus a
 * 2 px gold ring with a 2 px canvas offset on :focus-visible only. Loading swaps the
 * label for a spinner at the same width so nothing shifts.
 *
 * Legacy variant names (`default`, `gold`, `outline`, `ghost`, `link`) still resolve
 * so screens awaiting Phase 2 keep working; they map onto the four kinds.
 */
const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control text-body font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50 coarse:min-h-11",
  {
    variants: {
      variant: {
        primary: "bg-gold text-on-gold hover:bg-gold-hover",
        secondary: "border border-strong-border bg-surface text-text-primary hover:bg-inset",
        tertiary: "text-text-primary hover:underline hover:underline-offset-4 active:scale-100",
        destructive: "border border-danger-fg bg-surface text-danger-fg hover:bg-danger-bg",
        "destructive-solid": "bg-danger-fg text-surface hover:opacity-90",
        /* legacy aliases */
        default: "bg-gold text-on-gold hover:bg-gold-hover",
        gold: "bg-gold text-on-gold hover:bg-gold-hover",
        outline: "border border-strong-border bg-surface text-text-primary hover:bg-inset",
        ghost: "text-text-primary hover:bg-inset",
        link: "text-text-gold underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-body-sm",
        lg: "h-12 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Replaces the label with a spinner at the same width; the button is disabled while true. */
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  if (asChild)
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} {...props}>
        {children}
      </Comp>
    );
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }), loading && "disabled:opacity-100")}
      aria-busy={loading || undefined}
      disabled={props.disabled || loading}
      {...props}
    >
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <Loader2 className="h-5 w-5 animate-spin" />
        </span>
      )}
    </Comp>
  );
}

export { buttonVariants };
