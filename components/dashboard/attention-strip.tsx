import Link from "next/link";
import { ArrowLeftRight, ArrowRight, CreditCard, Hourglass, MessageSquareReply } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { AttentionItem, AttentionKind } from "@/lib/domain/dashboard";
import { cn } from "@/lib/utils";

const ICONS: Record<AttentionKind, typeof CreditCard> = {
  counter_offer: ArrowLeftRight,
  payment_due: CreditCard,
  card_needed: CreditCard,
  ops_reply: MessageSquareReply,
  hold_expiring: Hourglass,
};

/**
 * Needs your action (brief §7.2): first thing under the greeting, only when there is
 * something to do. One line per item with one primary link; the most urgent first.
 */
export function AttentionStrip({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null;
  return (
    <section
      aria-labelledby="attention-heading"
      className="border-attention-border bg-attention-bg rounded-card border"
    >
      <h2 id="attention-heading" className="text-text-primary text-h3 px-5 pt-4 font-semibold">
        Needs your action{" "}
        <span className="text-text-secondary text-body font-normal">
          · {items.length} {items.length === 1 ? "thing" : "things"}
        </span>
      </h2>
      <ul className="divide-attention-border mt-2 divide-y">
        {items.map((it, i) => {
          const Icon = ICONS[it.kind];
          return (
            <li
              key={`${it.kind}:${it.requestId}`}
              className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <Icon className="text-attention-fg mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <p className="min-w-0">
                  <span className="text-text-primary font-semibold">{it.title}</span>
                  <span className="text-text-secondary text-body-sm block truncate sm:inline sm:before:content-['_·_']">
                    {it.context}
                  </span>
                </p>
              </div>
              <Link
                href={it.href}
                className={cn(
                  buttonVariants({ variant: i === 0 ? "primary" : "secondary", size: "sm" }),
                  "w-full shrink-0 sm:w-auto",
                )}
              >
                {it.cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
