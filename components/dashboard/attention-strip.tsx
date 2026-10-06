import Link from "next/link";
import { ArrowLeftRight, CreditCard, Hourglass, MessageSquareReply } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AttentionItem, AttentionKind } from "@/lib/domain/dashboard";

const ICONS: Record<AttentionKind, typeof CreditCard> = {
  counter_offer: ArrowLeftRight,
  payment_due: CreditCard,
  ops_reply: MessageSquareReply,
  hold_expiring: Hourglass,
};

/** "Needs your attention": up to four single-action cards. Renders nothing when empty (no fluff). */
export function AttentionStrip({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="attention-heading">
      <h2 id="attention-heading" className="eyebrow mb-3">
        Needs your attention
      </h2>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-4">
        {items.map((it) => {
          const Icon = ICONS[it.kind];
          return (
            <li
              key={`${it.kind}:${it.requestId}`}
              className="border-gold-500/60 flex min-w-[280px] snap-start flex-col justify-between gap-3 rounded-lg border bg-white p-4 md:min-w-0"
            >
              <div className="flex gap-3">
                <span className="bg-gold-500/10 text-gold-600 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-navy-900 text-sm font-medium">{it.title}</p>
                  <p className="text-ink-500 line-clamp-2 text-xs">{it.context}</p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="self-start">
                <Link href={it.href}>{it.cta}</Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
