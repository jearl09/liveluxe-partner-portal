import { parseHouseRules } from "@/lib/domain/listing-content";

/**
 * House rules (§13.3). Hostaway sends one paragraph with "1. … 2. …" inline; the
 * parser turns that into a numbered list so a partner can find the fines, the bond
 * and the quiet hours without reading a wall of text. Wording is never changed, and
 * anything the parser cannot structure renders as the sanitised HTML it always did.
 */
export function HouseRules({ html }: { html: string | null }) {
  const view = parseHouseRules(html);
  if (!view) return null;

  return (
    <details aria-labelledby="rules-heading" className="group border-subtle bg-surface rounded-card border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span>
          <h2 id="rules-heading">House rules</h2>
          <span className="text-text-secondary text-body-sm mt-0.5 block">
            Standard occupancy rules apply; any fees are passed through at cost.
          </span>
        </span>
        <span className="text-text-primary text-body-sm shrink-0 font-semibold underline underline-offset-4">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="border-subtle border-t px-5 py-4">
        {view.kind === "html" ? (
          // Sanitised with DOMPurify at sync time (lib/hostaway/mappers.ts).
          <div
            className="prose-livluxe text-foreground max-w-prose text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: view.html }}
          />
        ) : (
          <div className="max-w-prose">
            {view.intro && <p className="text-muted-foreground mb-3 text-sm leading-relaxed">{view.intro}</p>}
            <ol className="border-border divide-border divide-y border-y">
              {view.rules.map((rule, i) => (
                <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-x-2 py-2.5 text-sm leading-relaxed">
                  <span className="text-text-muted text-body-sm pt-px tabular-nums" aria-hidden>
                    {i + 1}
                  </span>
                  <p className="text-foreground">
                    {rule.label && <span className="text-strong font-medium">{rule.label}: </span>}
                    {rule.text}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </details>
  );
}
