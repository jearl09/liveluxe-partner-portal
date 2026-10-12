import type { QuoteLine } from "@/lib/domain/quote-engine";
import { formatMoney } from "@/lib/domain/money";

/** Line-item breakdown shared by the form, the request page and the ops console. */
export function QuoteLines({
  lines,
  totalCents,
  depositCents,
  currency,
  nights,
  compact = false,
}: {
  lines: readonly QuoteLine[];
  totalCents: number;
  depositCents: number;
  currency: string;
  nights: number;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <table className="w-full text-sm">
        <caption className="sr-only">Price breakdown</caption>
        <tbody>
          {lines.map((l, i) => (
            <tr key={`${l.kind}-${i}`} className="border-border border-b last:border-0">
              <td className="text-foreground py-1.5 pr-2">{l.label}</td>
              <td className="text-strong py-1.5 text-right text-sm whitespace-nowrap tabular-nums">
                {l.amountCents < 0 ? "−" : ""}
                {formatMoney(Math.abs(l.amountCents), currency)}
              </td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td className="text-muted-foreground py-1.5 text-xs" colSpan={2}>
                Priced by Live Luxe
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td className="text-strong pt-3 font-medium">Total</td>
            <td className="text-strong pt-3 text-right font-serif text-xl whitespace-nowrap">
              {formatMoney(totalCents, currency)}
            </td>
          </tr>
          <tr>
            <td className="text-muted-foreground text-xs" colSpan={2}>
              {nights > 0 &&
                `${formatMoney(Math.round(totalCents / nights), currency)} average per night · ${nights} nights`}
            </td>
          </tr>
        </tfoot>
      </table>
      {depositCents > 0 && (
        <p className="text-muted-foreground text-xs">
          Security deposit {formatMoney(depositCents, currency)} is authorised separately and only charged if needed.
        </p>
      )}
    </div>
  );
}
