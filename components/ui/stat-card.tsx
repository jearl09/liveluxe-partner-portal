import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** KPI tile for dashboards. Numbers are formatted by the caller (money always with the AUD prefix, §13.5). */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "navy",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "navy" | "gold";
}) {
  return (
    <div className="border-cream-200 rounded-xl border bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-ink-700 text-sm font-medium">{label}</p>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            tone === "gold" ? "bg-gold-500/10 text-gold-600" : "bg-navy-900/5 text-navy-900",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="text-navy-900 mt-3 font-serif text-4xl">{value}</p>
      {hint && <p className="text-ink-500 mt-1 text-xs">{hint}</p>}
    </div>
  );
}
