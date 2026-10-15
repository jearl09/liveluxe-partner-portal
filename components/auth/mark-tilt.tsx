"use client";

import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { MARK_VIEWBOX } from "./brand-mark-data";

const MAX_TILT = 9; // degrees: a coin turned in the hand, not a spin

/**
 * The monogram's hover (DECISIONS #82). With a mouse or pen it tilts toward the pointer in 3D, lifts a little,
 * its shadow spreads (globals.css reads --lift) and a glint follows the pointer across the metal; on leave it
 * eases back over 600 ms. A tap on a touch screen plays the sheen once instead. Nothing happens under reduced
 * motion. All of it is CSS custom properties on this element, written at most once a frame.
 */
export function MarkTilt({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Once the mark is written, its pen masks can go (globals.css), so hover frames stay cheap.
  // Waits for the pen animations themselves, not a clock, so a slow device never loses a half-written stroke.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let live = true;
    const pens = el.querySelectorAll(".ll-mark-pen path, .ll-mark-done");
    const running = [...pens].flatMap((p) => p.getAnimations());
    Promise.all(running.map((a) => a.finished))
      .catch(() => undefined)
      .then(() => live && el.setAttribute("data-drawn", ""));
    return () => {
      live = false;
    };
  }, []);

  function set(vars: Record<string, string>) {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = root.current;
      if (el) for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    });
  }

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch" || still()) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    e.currentTarget.dataset.tracking = "";
    // The further from centre, the more it tilts and the higher it lifts: the shadow spreads with the tilt.
    const reach = Math.min(1, Math.hypot(x - 0.5, y - 0.5) / 0.5);
    set({
      "--ry": `${((x - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`,
      "--rx": `${((0.5 - y) * 2 * MAX_TILT).toFixed(2)}deg`,
      "--lift": (0.35 + 0.65 * reach).toFixed(2),
      "--gx": `${(x * MARK_VIEWBOX.w).toFixed(1)}px`,
      "--gy": `${(y * MARK_VIEWBOX.h).toFixed(1)}px`,
      "--glint": "1",
    });
  }

  function onLeave(e: PointerEvent<HTMLDivElement>) {
    delete e.currentTarget.dataset.tracking;
    set({ "--ry": "0deg", "--rx": "0deg", "--lift": "0", "--glint": "0" });
  }

  function onDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch" || still()) return;
    const sheen = e.currentTarget.querySelector<SVGGElement>(".ll-mark-sheen");
    sheen?.animate(
      [
        { opacity: 1, transform: "translateX(-30px)" },
        { opacity: 1, transform: `translateX(${MARK_VIEWBOX.w + 150}px)` },
      ],
      { duration: 900, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
    );
  }

  return (
    <div
      ref={root}
      className="ll-tilt"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onPointerCancel={onLeave}
      onPointerDown={onDown}
    >
      <div className="ll-tilt-body">{children}</div>
    </div>
  );
}
