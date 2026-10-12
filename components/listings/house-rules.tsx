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
    <section aria-labelledby="rules-heading" className="space-y-3">
      <h2 id="rules-heading" className="font-serif text-xl">
        House rules
      </h2>

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
                <span className="text-muted-foreground pt-px text-xs tabular-nums" aria-hidden>
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
    </section>
  );
}
