import { useId, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { MARK_SHAPES, MARK_VIEWBOX, type MarkShape } from "./brand-mark-data";

/**
 * The Live Luxe monogram, as it appears on the sign-in screens (DECISIONS #81).
 *
 *  draw      A: written on in gold, thick strokes first and the script L last, then one light catch.
 *  coin      B: one slow turn on its vertical axis, like a coin catching the light, then the light catch.
 *  assemble  C: the strokes slide together into the monogram, then the light catch.
 *
 * All motion is CSS (globals.css, "The sign-in monogram") and plays once on load; the default state of every
 * element is the finished mark, so reduced motion, a repeat visit or failed CSS all show it complete.
 * `once` ties it to the per-visit flag that AuthShell's inline script sets.
 */
export type MarkVariant = "draw" | "coin" | "assemble";

type Id = MarkShape["id"];

/** Seconds from load at which each pen stroke starts and ends (variant A). */
const DRAW: Record<Id, [number, number][]> = {
  "i-cap": [
    [0, 0.14],
    [0.14, 0.44],
  ],
  "i-stem": [
    [0.3, 0.78],
    [0.78, 0.92],
  ],
  "l-foot": [[0.66, 1]],
  "c-arc": [[0.84, 1.32]],
  script: [
    [1.06, 1.88],
    [1.9, 2.02],
  ],
};

/** Variant C: where each shape slides in from (viewBox units) and when. */
const ASSEMBLE: Record<Id, { x: number; y: number; at: number }> = {
  "i-cap": { x: 0, y: -18, at: 0 },
  "i-stem": { x: 0, y: 18, at: 0.12 },
  "l-foot": { x: 18, y: 0, at: 0.28 },
  "c-arc": { x: -18, y: 0, at: 0.4 },
  script: { x: 10, y: 14, at: 0.55 },
};

const SHEEN_AT: Record<MarkVariant, number> = { draw: 1.92, coin: 1.35, assemble: 1.45 };

/** Inverse of the sine ease-in-out, so a pen accelerates out of each stroke's start and slows into its end. */
const unease = (f: number) => Math.acos(1 - 2 * Math.min(1, Math.max(0, f))) / Math.PI;

const s = (n: number) => `${n.toFixed(2)}s`;
const vars = (v: Record<string, string>) => v as CSSProperties;

export function BrandMark({
  variant = "draw",
  once = false,
  className,
}: {
  variant?: MarkVariant;
  once?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { w, h } = MARK_VIEWBOX;
  const draw = variant === "draw";

  return (
    <span className={cn("ll-mark", className)} data-variant={variant} data-once={once || undefined}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        role="img"
        aria-labelledby={`${uid}-t`}
        className="block h-full w-auto overflow-visible"
      >
        <title id={`${uid}-t`}>Live Luxe</title>
        {/* Masks are luminance: white lets the shape through. A mechanism, not a colour. */}
        <defs aria-hidden>
          {/* Each outline is defined once and used twice: as the mark, and as the shape the light is clipped to. */}
          {MARK_SHAPES.map((shape) => (
            <path key={shape.id} id={`${uid}-s-${shape.id}`} d={shape.d} fillRule="evenodd" />
          ))}
          {draw &&
            MARK_SHAPES.map((shape) => {
              const windows = DRAW[shape.id];
              const end = windows[windows.length - 1][1];
              return (
                <mask id={`${uid}-${shape.id}`} key={shape.id}>
                  <g className="ll-mark-pen" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round">
                    {shape.strokes.flatMap((pieces, k) => {
                      const [start, stop] = windows[k];
                      const total = pieces.reduce((sum, p) => sum + p.len, 0);
                      let run = 0;
                      return pieces.map((p, i) => {
                        const t0 = start + (stop - start) * unease(run / total);
                        run += p.len;
                        const t1 = start + (stop - start) * unease(run / total);
                        return (
                          <path
                            key={`${k}-${i}`}
                            d={p.d}
                            strokeWidth={p.w}
                            pathLength={1}
                            style={vars({ "--d": s(t0), "--t": s(Math.max(0.02, t1 - t0)) })}
                          />
                        );
                      });
                    })}
                  </g>
                  <rect className="ll-mark-done" width={w} height={h} fill="white" style={vars({ "--d": s(end) })} />
                </mask>
              );
            })}
          <mask id={`${uid}-all`}>
            {MARK_SHAPES.map((shape) => (
              <use key={shape.id} href={`#${uid}-s-${shape.id}`} fill="white" />
            ))}
          </mask>
          <linearGradient id={`${uid}-sheen`}>
            <stop offset="0" stopColor="var(--mark-sheen)" stopOpacity="0" />
            <stop offset="0.5" stopColor="var(--mark-sheen)" stopOpacity="0.85" />
            <stop offset="1" stopColor="var(--mark-sheen)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g fill="currentColor">
          {MARK_SHAPES.map((shape) => {
            const a = ASSEMBLE[shape.id];
            return (
              <use
                key={shape.id}
                href={`#${uid}-s-${shape.id}`}
                className="ll-mark-shape"
                mask={draw ? `url(#${uid}-${shape.id})` : undefined}
                style={
                  variant === "assemble" ? vars({ "--x": `${a.x}px`, "--y": `${a.y}px`, "--d": s(a.at) }) : undefined
                }
              />
            );
          })}
        </g>
        <g mask={`url(#${uid}-all)`} aria-hidden>
          <g className="ll-mark-sheen" style={vars({ "--d": s(SHEEN_AT[variant]), "--to": `${w + 150}px` })}>
            <rect x={-40} y={-20} width={44} height={h + 40} fill={`url(#${uid}-sheen)`} transform="skewX(-20)" />
          </g>
        </g>
      </svg>
    </span>
  );
}
