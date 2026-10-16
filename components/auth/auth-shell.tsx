import type { CSSProperties, ReactNode } from "react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AUTH_FLASH_KEYS, ScrubParams } from "@/components/ui/scrub-params";
import { CanvasWaves } from "@/components/brand/canvas-waves";
import { BrandMark } from "./brand-mark";
import { MarkTilt } from "./mark-tilt";

/** sessionStorage key: set on the first sign-in screen of a visit, so the monogram is written once per tab. */
const MARK_SEEN_KEY = "livluxe.mark";
const MARK_ONCE_SCRIPT = `(function(){try{var k=${JSON.stringify(MARK_SEEN_KEY)};if(sessionStorage.getItem(k)){document.documentElement.setAttribute("data-ll-mark","seen")}else{sessionStorage.setItem(k,"1")}}catch(e){}})()`;

const at = (delay: string) => ({ "--enter-at": delay }) as CSSProperties;

/**
 * Public auth surfaces: login, invite acceptance, password reset, MFA (§13.1). Shared by partners and Live Luxe
 * staff, so it names neither. Branded, minimal, no inventory.
 *
 * One centred column (DECISIONS #82): the gold monogram, the wordmark, the card, one line on what Live Luxe does,
 * and a footer. Navy with gold contour lines at night, cream silk by day (the canvas pattern), a warm glow behind the mark. The form never
 * waits for the mark: the card rises in while it is still being written, and the first field has focus at once.
 */
export function AuthShell({ children, once = true }: { children: ReactNode; once?: boolean }) {
  return (
    <div className="auth-page relative flex min-h-screen flex-col overflow-hidden">
      {/* Runs before the mark is parsed, so a repeat visit never shows the first frame of the animation. */}
      {once && <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: MARK_ONCE_SCRIPT }} />}
      <CanvasWaves variant="signin" replay={!once} className="absolute inset-0" />
      {/* These screens have no app chrome, so the theme control sits on the page itself. */}
      <header className="absolute top-4 right-4 z-10 lg:top-6 lg:right-6">
        <ThemeToggle />
      </header>
      {/* "Password changed", "code not accepted" and friends are one-shot: shown, then dropped from the URL. */}
      <ScrubParams keys={AUTH_FLASH_KEYS} />

      <main className="relative flex flex-1 flex-col items-center justify-center px-4 pt-14 pb-8 sm:pt-16">
        <div className="relative">
          <div
            aria-hidden
            className="auth-glow pointer-events-none absolute top-1/2 left-1/2 size-[30rem] -translate-1/2"
          />
          <MarkTilt>
            <BrandMark once={once} className="h-24 md:h-38" />
          </MarkTilt>
        </div>
        <div className="ll-enter mt-5 flex flex-col items-center gap-1.5 text-center" style={at("0.08s")}>
          <p className="text-foreground font-serif text-3xl leading-none md:text-4xl">Live Luxe</p>
          <p className="eyebrow">Melbourne · Australia</p>
        </div>
        <div
          className="ll-enter border-subtle bg-surface-raised rounded-card relative mt-8 w-full max-w-[420px] border p-6 shadow-md sm:p-8"
          style={at("0.2s")}
        >
          {children}
        </div>
        <p className="ll-enter text-text-muted relative mt-6 max-w-[420px] text-center text-sm" style={at("0.3s")}>
          Long-stay apartments for insurance, corporate and government placements.
        </p>
      </main>

      <footer className="text-text-muted relative pb-6 text-center text-xs">
        Invite-only · Confidential · Live Luxe Pty Ltd
      </footer>
    </div>
  );
}
