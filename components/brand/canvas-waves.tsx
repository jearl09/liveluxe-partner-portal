"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** sessionStorage key: the app's sheen plays on the first page of a visit only. */
const APP_SHEEN_KEY = "livluxe.canvas-sheen";

const VARIANTS = {
  /**
   * Sign-in: the signature moment. One 2.5 s sweep that crosses the middle of the page at about 2.45 s, as the
   * monogram catches its own light (brand-mark.tsx: sheen from 2.0 s to 2.9 s), then a lamp over the whole page.
   * Played once a visit, with the monogram's own intro (html[data-ll-mark="seen"] means it already played).
   */
  signin: { sweepMs: 2500, delayMs: 1200, lightSolid: "45%", lightEnd: "100%" },
  /** Every other page: one 2 s sweep a session; the light stays in the title band. */
  app: { sweepMs: 2000, delayMs: 250, lightSolid: "90px", lightEnd: "240px" },
} as const;

/**
 * The canvas's gold waves and the light that crosses them (globals.css, "The page's signature pattern").
 *
 * Gold does not move on its own; light moves across it as you move. So: still waves, one sheen when the page first
 * appears, and afterwards a soft lamp that follows a mouse. Touch screens get the sheen only. Nothing loops, nothing
 * runs while the tab is hidden, and reduced motion leaves the waves still with no light at all. The pointer handler
 * is passive and does at most one style write per frame; the light moves by transform, on the compositor.
 *
 * Decorative: aria-hidden, never focusable, never behind text inside a card, table, form or picker.
 */
export function CanvasWaves({
  variant,
  replay = false,
  className,
}: {
  variant: keyof typeof VARIANTS;
  /** Play the sheen on every load (the motion preview page). */
  replay?: boolean;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const lamp = useRef<HTMLDivElement>(null);
  const v = VARIANTS[variant];

  useEffect(() => {
    const el = root.current;
    const pool = lamp.current;
    if (!el || !pool) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cleanups: (() => void)[] = [];
    const listen = <K extends keyof WindowEventMap>(
      target: Window | Document,
      type: K | string,
      fn: (e: Event) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn, opts);
      cleanups.push(() => target.removeEventListener(type, fn, opts));
    };

    // --- The sheen: once. -------------------------------------------------------------------------------------
    const alreadySeen = (() => {
      if (replay) return false;
      if (variant === "signin") return document.documentElement.dataset.llMark === "seen";
      try {
        if (sessionStorage.getItem(APP_SHEEN_KEY)) return true;
        sessionStorage.setItem(APP_SHEEN_KEY, "1");
      } catch {
        // Storage blocked: play it; at worst it plays again on the next page.
      }
      return false;
    })();
    // The monogram's own animation starts at first paint; this effect runs after hydration, a moment later. Count
    // the delay from first paint so the two lights still meet.
    const paintedAt =
      variant === "signin"
        ? (performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? performance.now())
        : performance.now();
    const delay = Math.max(0, v.delayMs - (performance.now() - paintedAt));
    const sweepEnds = alreadySeen ? 0 : performance.now() + delay + v.sweepMs;
    const startSweep = () => {
      if (alreadySeen || el.hasAttribute("data-sweep")) return;
      el.style.setProperty("--sweep-delay", `${Math.round(delay)}ms`);
      el.setAttribute("data-sweep", "");
    };
    // Not while the tab is hidden: start it when the page is first seen, and pause it if the tab is left.
    if (document.visibilityState === "visible") startSweep();
    listen(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") {
        el.removeAttribute("data-hidden");
        startSweep();
      } else {
        el.setAttribute("data-hidden", "");
        el.removeAttribute("data-lit");
      }
    });

    // --- The lamp: a mouse only. ------------------------------------------------------------------------------
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return () => cleanups.forEach((c) => c());
    let frame = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      frame = 0;
      // On sign-in the lamp waits for the intro to finish, so the sheen has the stage to itself.
      if (performance.now() < sweepEnds) return;
      const r = el.getBoundingClientRect();
      const lx = x - r.left;
      const ly = y - r.top;
      const near = lx > -200 && lx < r.width + 200 && ly > -200 && ly < r.height + 200;
      pool.style.transform = `translate3d(${Math.round(lx)}px, ${Math.round(ly)}px, 0)`;
      el.toggleAttribute("data-lit", near && document.visibilityState === "visible");
    };
    listen(
      window,
      "pointermove",
      (e) => {
        const p = e as PointerEvent;
        if (p.pointerType !== "mouse") return;
        x = p.clientX;
        y = p.clientY;
        if (!frame) frame = requestAnimationFrame(paint);
      },
      { passive: true },
    );
    listen(document, "pointerleave", () => el.removeAttribute("data-lit"));
    listen(window, "blur", () => el.removeAttribute("data-lit"));
    return () => {
      cancelAnimationFrame(frame);
      cleanups.forEach((c) => c());
    };
  }, [replay, variant, v.delayMs, v.sweepMs]);

  return (
    <div
      ref={root}
      aria-hidden
      className={cn("canvas-waves pointer-events-none print:hidden", className)}
      style={
        {
          "--sweep-ms": `${v.sweepMs}ms`,
          "--sweep-delay": `${v.delayMs}ms`,
          "--light-solid": v.lightSolid,
          "--light-end": v.lightEnd,
        } as CSSProperties
      }
    >
      <div className="canvas-pattern absolute inset-0" />
      <div className="canvas-light">
        <div className="canvas-sheen" />
        <div ref={lamp} className="canvas-lamp" />
      </div>
    </div>
  );
}
