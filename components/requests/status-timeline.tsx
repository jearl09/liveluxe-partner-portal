import { STATUS_LABELS } from "@/lib/domain/status";
import type { HistoryEntry } from "@/lib/requests/load";
import { cn, formatTimestamp } from "@/lib/utils";

/** System notes that only repeat the status ("submitted", "review started") add nothing to the record. */
const ROUTINE = /^(submitted|review started|approved|confirmed via (approval|webhook|payment)|hold expired)$/i;

export interface Milestone {
  label: string;
  /** Already formatted, with timezone. */
  when: string;
}

/**
 * The record of a request (brief §8.4): every status change in reading order (oldest
 * first), each with who did it and when, and the note where there is one; then the
 * milestones still to come in muted text ("Check-in pack releases …").
 */
export function StatusTimeline({
  history,
  showInternal = false,
  upcoming = [],
}: {
  history: HistoryEntry[];
  showInternal?: boolean;
  upcoming?: Milestone[];
}) {
  return (
    <ol className="border-subtle relative space-y-4 border-l pl-5">
      {history.map((h, i) => {
        const who =
          h.actorType === "system"
            ? "System"
            : h.actorType === "livluxe"
              ? h.actorName
                ? `${h.actorName} (Live Luxe)`
                : "Live Luxe"
              : (h.actorName ?? "Partner");
        const message = (h.metadata?.message as string | undefined) ?? null;
        const last = i === history.length - 1;
        return (
          <li key={h.id} className="relative">
            <span
              aria-hidden
              className={cn(
                "rounded-pill absolute top-1.5 -left-[1.6rem] h-2.5 w-2.5 border-2",
                last ? "border-gold bg-gold" : "border-strong-border bg-surface",
              )}
            />
            <p className="text-text-primary">
              <span className="font-semibold">{STATUS_LABELS[h.to]}</span>
              <span className="text-text-secondary"> · {who}</span>
            </p>
            <p className="text-text-muted text-body-sm">
              <time dateTime={h.at}>{formatTimestamp(h.at)}</time>
            </p>
            {message && <p className="text-text-secondary mt-1">“{message}”</p>}
            {showInternal && h.reason && !message && !ROUTINE.test(h.reason) && (
              <p className="text-text-muted text-body-sm mt-0.5">{h.reason}</p>
            )}
          </li>
        );
      })}
      {upcoming.map((m) => (
        <li key={m.label} className="relative">
          <span
            aria-hidden
            className="border-subtle bg-canvas rounded-pill absolute top-1.5 -left-[1.6rem] h-2.5 w-2.5 border-2 border-dashed"
          />
          <p className="text-text-muted">
            {m.label} <span className="sr-only">(still to come)</span>
          </p>
          <p className="text-text-muted text-body-sm">{m.when}</p>
        </li>
      ))}
    </ol>
  );
}
