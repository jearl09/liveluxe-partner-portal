import type { CSSProperties, ReactNode } from "react";
import { Wordmark } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AUTH_FLASH_KEYS, ScrubParams } from "@/components/ui/scrub-params";
import { BrandMark, type MarkVariant } from "./brand-mark";

/** sessionStorage key: set on the first sign-in screen of a visit, so the monogram is written once per tab. */
const MARK_SEEN_KEY = "livluxe.mark";
const MARK_ONCE_SCRIPT = `(function(){try{var k=${JSON.stringify(MARK_SEEN_KEY)};if(sessionStorage.getItem(k)){document.documentElement.setAttribute("data-ll-mark","seen")}else{sessionStorage.setItem(k,"1")}}catch(e){}})()`;

const at = (delay: string) => ({ "--enter-at": delay }) as CSSProperties;

/**
 * Public auth surfaces: login, invite acceptance, password reset, MFA (§13.1).
 * Branded, minimal, no inventory. Split layout echoing the public site's hero:
 * navy brand panel on the left, the form on the canvas to the right. Stacks on mobile.
 * The navy panel keeps its fixed brand colours in both themes — it is the hero of the
 * public site, not a surface — while the form side follows the theme like everything else.
 *
 * The monogram sits above the card on the themed side, so it is Gold Ink on cream and Antique Gold at night
 * (DECISIONS #81). The form never waits for it: the card rises in while the mark is still being written, and
 * the email field has focus from the first frame.
 */
export function AuthShell({
  children,
  markVariant = "draw",
  once = true,
}: {
  children: ReactNode;
  markVariant?: MarkVariant;
  /** Write the mark only on the first sign-in screen of a visit. Off in the dev preview, which replays on load. */
  once?: boolean;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[5fr_6fr]">
      {/* Runs before the mark is parsed, so a repeat visit never shows the first frame of the animation. */}
      {once && <script dangerouslySetInnerHTML={{ __html: MARK_ONCE_SCRIPT }} />}
      <aside className="bg-navy-900 border-on-navy-line text-on-navy relative flex flex-col justify-between overflow-hidden px-6 py-6 sm:px-8 sm:py-8 lg:border-r lg:px-14 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(transparent 31px, var(--on-navy-grid) 32px), linear-gradient(90deg, transparent 31px, var(--on-navy-grid) 32px)",
            backgroundSize: "32px 32px",
          }}
        />
        <Wordmark descriptor="Partner portal" tone="dark" className="relative" />
        <div className="ll-enter relative mt-8 max-w-md lg:my-0" style={at("0.08s")}>
          <p className="eyebrow eyebrow-on-navy mb-4">Melbourne · Sydney · Brisbane</p>
          {/* A paragraph, not a heading: each auth page's card holds its one h1 ("Sign in", "Reset your password"). */}
          <p className="text-on-navy font-serif text-3xl leading-[1.08] font-normal lg:text-5xl">
            Long-stay apartments for the people you look after.
          </p>
          <div className="gold-rule my-6 hidden lg:block" />
          <p className="text-on-navy-muted hidden text-base leading-relaxed lg:block">
            Live availability, partner rates and a decision from our team within the agreed SLA. Built for insurance,
            corporate and government placements.
          </p>
        </div>
        <p className="eyebrow eyebrow-on-navy relative hidden lg:block">Invite-only · Confidential</p>
      </aside>
      <main className="bg-background relative flex flex-col items-center justify-center px-4 py-10 lg:px-12">
        {/* These screens have no app chrome, so the theme control sits on the canvas itself. */}
        <div className="absolute top-4 right-4 lg:top-6 lg:right-6">
          <ThemeToggle />
        </div>
        {/* "Password changed", "code not accepted" and friends are one-shot: shown, then dropped from the URL. */}
        <ScrubParams keys={AUTH_FLASH_KEYS} />
        <BrandMark variant={markVariant} once={once} className="mb-6 h-16 lg:mb-8 lg:h-28" />
        <div
          className="ll-enter border-subtle bg-surface rounded-card w-full max-w-[420px] border p-6 shadow-md sm:p-8"
          style={at("0.2s")}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
