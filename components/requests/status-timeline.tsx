import { STATUS_LABELS } from "@/lib/domain/dashboard";
import type { HistoryEntry } from "@/lib/requests/load";
import { formatTimestamp } from "@/lib/utils";

/** Every status change, who made it and when. Timestamps carry the timezone (§13.5). */
export function StatusTimeline({ history, showInternal = false }: { history: HistoryEntry[]; showInternal?: boolean }) {
  return (
    <ol className="space-y-3">
      {history.map((h) => {
        const who =
          h.actorType === "system" ? "System" : (h.actorName ?? (h.actorType === "livluxe" ? "Live Luxe" : "Partner"));
        const message = (h.metadata?.message as string | undefined) ?? null;
        return (
          <li key={h.id} className="flex gap-3 text-sm">
            <span className="bg-gold-500 mt-1.5 h-2 w-2 shrink-0 rounded-full" aria-hidden />
            <div>
              <p className="text-navy-900">
                <span className="font-medium">{STATUS_LABELS[h.to]}</span>
                <span className="text-ink-500"> · {who}</span>
              </p>
              <p className="text-ink-500 text-xs">
                <time dateTime={h.at} title={new Date(h.at).toISOString()}>
                  {formatTimestamp(h.at)}
                </time>
              </p>
              {message && <p className="text-ink-700 mt-1 text-sm">“{message}”</p>}
              {showInternal && h.reason && !message && <p className="text-ink-500 mt-0.5 text-xs">{h.reason}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
