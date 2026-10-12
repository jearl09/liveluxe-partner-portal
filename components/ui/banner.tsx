import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type BannerTone = "info" | "warn" | "error" | "success";

const TONES: Record<BannerTone, { className: string; Icon: LucideIcon; role: "status" | "alert" }> = {
  info: { className: "border-border bg-muted text-foreground", Icon: Info, role: "status" },
  warn: { className: "border-warn-border bg-warn-bg text-warn", Icon: AlertTriangle, role: "status" },
  error: { className: "border-bad-border bg-bad-bg text-bad", Icon: XCircle, role: "alert" },
  success: { className: "border-ok-border bg-ok-bg text-ok", Icon: CheckCircle2, role: "status" },
};

/**
 * Inline message strip — the one shape for outcomes, warnings and setup hints,
 * whether on the auth screens or inside the portal. Errors announce as alerts; the
 * rest are polite status. Children may be a sentence or a few short paragraphs.
 */
export function Banner({
  tone = "info",
  className,
  children,
}: {
  tone?: BannerTone;
  className?: string;
  children: ReactNode;
}) {
  const { className: toneClass, Icon, role } = TONES[tone];
  return (
    <div
      role={role}
      className={cn("flex items-start gap-2.5 rounded-md border px-4 py-3 text-sm leading-snug", toneClass, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1.5 [&_code]:font-mono [&_code]:text-[0.8125em]">{children}</div>
    </div>
  );
}
