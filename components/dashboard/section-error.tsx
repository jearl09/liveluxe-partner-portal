import { RefreshCw } from "lucide-react";
import { Panel } from "@/components/ui/panel";

/** Inline failure card with a support reference that correlates to the server log (§13.5). */
export function SectionError({ what, refCode }: { what: string; refCode: string }) {
  return (
    <Panel as="div" className="py-6 text-sm">
      <p className="text-strong font-medium">We couldn&apos;t load your {what}.</p>
      <p className="text-muted-foreground mt-1">
        <a href="" className="text-strong inline-flex items-center gap-1 underline">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again
        </a>
        <span className="mx-2">·</span>
        Ref <span className="font-mono">{refCode}</span>
      </p>
    </Panel>
  );
}
