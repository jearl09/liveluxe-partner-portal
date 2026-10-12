import type { ReactNode } from "react";
import { Wordmark } from "@/components/layout/brand";

/**
 * Public auth surfaces: login, invite acceptance, password reset, MFA (§13.1).
 * Branded, minimal, no inventory. Split layout echoing the public site's hero:
 * navy brand panel on the left, the form on cream on the right. Stacks on mobile.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[5fr_6fr]">
      <aside className="bg-navy-900 relative flex flex-col justify-between overflow-hidden px-8 py-8 text-white lg:px-14 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(transparent 31px, rgba(255,255,255,.6) 32px), linear-gradient(90deg, transparent 31px, rgba(255,255,255,.6) 32px)",
            backgroundSize: "32px 32px",
          }}
        />
        <Wordmark descriptor="Partner portal" tone="dark" className="relative" />
        <div className="relative my-12 max-w-md lg:my-0">
          <p className="eyebrow mb-4">Docklands, Melbourne</p>
          <h1 className="font-serif text-4xl leading-[1.08] font-normal text-white lg:text-5xl">
            Long-stay apartments for the people you look after.
          </h1>
          <div className="gold-rule my-6" />
          <p className="text-base leading-relaxed text-white/80">
            Live availability, partner rates and a decision from our team within the agreed SLA. Built for insurance,
            corporate and government placements.
          </p>
        </div>
        <p className="eyebrow relative hidden lg:block">Invite-only · Confidential</p>
      </aside>
      <section className="bg-cream-50 flex items-center justify-center px-4 py-10 lg:px-12">
        <div className="border-cream-200 w-full max-w-md rounded-xl border bg-white p-8 shadow-[0_8px_30px_rgba(16,28,44,0.06)]">
          {children}
        </div>
      </section>
    </div>
  );
}
