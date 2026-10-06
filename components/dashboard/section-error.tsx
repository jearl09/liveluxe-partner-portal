import { RefreshCw } from "lucide-react";

/** Inline failure card with a support reference that correlates to the server log (§13.5). */
export function SectionError({ what, refCode }: { what: string; refCode: string }) {
  return (
    <div className="border-cream-200 rounded-lg border bg-white px-5 py-6 text-sm">
      <p className="text-navy-900 font-medium">We couldn&apos;t load your {what}.</p>
      <p className="text-ink-500 mt-1">
        <a href="" className="text-navy-900 inline-flex items-center gap-1 underline">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again
        </a>
        <span className="mx-2">·</span>
        Ref <span className="font-mono">{refCode}</span>
      </p>
    </div>
  );
}
