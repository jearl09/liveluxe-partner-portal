import { parseDescription, type DescriptionBlock } from "@/lib/domain/listing-content";

/** Short items (a kitchen inventory) read better in two columns; long ones do not. */
const isInventory = (items: string[]) => items.length >= 4 && items.every((i) => i.length <= 44);

function Block({ block }: { block: DescriptionBlock }) {
  const { heading, paragraphs, items } = block;
  return (
    <div className="grid gap-x-6 gap-y-1.5 py-4 sm:grid-cols-[7.5rem_1fr]">
      {heading ? (
        <h3 className="text-strong text-sm font-medium sm:pt-px">{heading}</h3>
      ) : (
        <span className="hidden sm:block" aria-hidden />
      )}
      <div className="space-y-2">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-foreground text-sm leading-relaxed">
            {p}
          </p>
        ))}
        {items.length > 0 && (
          <ul
            className={
              isInventory(items)
                ? "text-foreground grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2"
                : "text-foreground space-y-1 text-sm"
            }
          >
            {items.map((item, i) => (
              <li key={i} className="flex gap-2 leading-relaxed">
                <span className="bg-accent/60 mt-[0.55em] h-px w-2 shrink-0" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Property description (§13.3). Hostaway stores it as one paragraph whose only
 * structure is decorative — "╰┈➤ Kitchen", "➤ Microwave" — which renders as a wall
 * of text. The parser recovers the author's sections and lists; this lays them out
 * as a spec sheet, room name beside its detail, so a booker can find the laundry
 * without reading the whole thing. Copy that has no structure to find renders as
 * the prose it always was.
 */
export function PropertyDescription({ html }: { html: string | null }) {
  const view = parseDescription(html);
  if (!view) return null;

  return (
    <section aria-labelledby="about-heading" className="space-y-3">
      <h2 id="about-heading" className="font-serif text-xl">
        About this property
      </h2>

      {view.kind === "html" ? (
        // Sanitised with DOMPurify at sync time (lib/hostaway/mappers.ts).
        <div
          className="prose-livluxe text-foreground max-w-prose text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: view.html }}
        />
      ) : (
        <div className="max-w-prose">
          {view.intro && <p className="text-foreground text-sm leading-relaxed">{view.intro}</p>}
          <div className="divide-border mt-1 divide-y">
            {view.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
