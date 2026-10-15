import { useId, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { MARK_SHAPES, MARK_VIEWBOX, type MarkShape } from "./brand-mark-data";

/**
 * The Live Luxe monogram on the sign-in page (DECISIONS #81–82), as polished gold.
 *
 * Written on once per visit, thick strokes first and the script L last, then one bright sheen; after that it is
 * still. The metal is a gradient angled like light on a curved surface, with a bright edge along the top of each
 * stroke and a warm shadow beneath (globals.css), so it reads as raised foil. MarkTilt adds the hover tilt and the
 * glint that follows the cursor. All motion is CSS; the default state of every element is the finished mark.
 *
 * Decorative: the wordmark beside it carries the name, so the whole drawing is aria-hidden.
 */
type Id = MarkShape["id"];

/** Seconds from load at which each pen stroke starts and ends. */
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
const SHEEN_AT = 2;

/** Inverse of the sine ease-in-out, so a pen accelerates out of each stroke's start and slows into its end. */
const unease = (f: number) => Math.acos(1 - 2 * Math.min(1, Math.max(0, f))) / Math.PI;

const s = (n: number) => `${n.toFixed(2)}s`;
const vars = (v: Record<string, string>) => v as CSSProperties;
const stop = (offset: number, token: string, opacity = 1) => (
  <stop offset={offset} stopColor={`var(${token})`} stopOpacity={opacity} />
);

export function BrandMark({ once = false, className }: { once?: boolean; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { w, h } = MARK_VIEWBOX;
  const ref = (name: string) => `url(#${uid}-${name})`;
  const shapes = (mask?: (id: Id) => string) =>
    MARK_SHAPES.map((shape) => (
      <use
        key={shape.id}
        href={`#${uid}-s-${shape.id}`}
        mask={mask?.(shape.id)}
        className={mask ? "ll-mark-shape" : undefined}
      />
    ));

  return (
    <span className={cn("ll-mark", className)} data-once={once || undefined} aria-hidden>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="block h-full w-auto overflow-visible">
        {/* Masks are luminance: white lets the shape through, black holds it back. A mechanism, not a colour. */}
        <defs>
          {/* Each outline is defined once, then used for the metal, the bright edge, the glint and the sheen. */}
          {MARK_SHAPES.map((shape) => (
            <path key={shape.id} id={`${uid}-s-${shape.id}`} d={shape.d} fillRule="evenodd" />
          ))}
          <g id={`${uid}-all`}>{shapes()}</g>
          {MARK_SHAPES.map((shape) => {
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
          <mask id={`${uid}-whole`}>
            <use href={`#${uid}-all`} fill="white" />
          </mask>
          {/* The top edge of every stroke: the shape, less itself nudged down and right a little. */}
          <mask id={`${uid}-edge`}>
            <use href={`#${uid}-all`} fill="white" />
            <use href={`#${uid}-all`} fill="black" transform="translate(0.8 2.2)" />
          </mask>
          {/* Light falling on curved metal from the upper left: shadow, gold, a pale highlight, gold, warm gold. */}
          <linearGradient id={`${uid}-metal`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={w} y2={h * 0.9}>
            {stop(0, "--mark-metal-1")}
            {stop(0.32, "--mark-metal-2")}
            {stop(0.5, "--mark-metal-3")}
            {stop(0.68, "--mark-metal-2")}
            {stop(1, "--mark-metal-4")}
          </linearGradient>
          <linearGradient id={`${uid}-sheen`}>
            {stop(0, "--mark-sheen", 0)}
            {stop(0.5, "--mark-sheen", 0.9)}
            {stop(1, "--mark-sheen", 0)}
          </linearGradient>
          <radialGradient id={`${uid}-glint`}>
            {stop(0, "--mark-sheen", 0.7)}
            {stop(1, "--mark-sheen", 0)}
          </radialGradient>
        </defs>

        <g fill={ref("metal")}>{shapes((id) => ref(id))}</g>
        {/* The bright edge is written on with each stroke, under that stroke's own mask. */}
        <g fill="var(--mark-edge)" mask={ref("edge")}>
          {shapes((id) => ref(id))}
        </g>
        <g mask={ref("whole")}>
          <circle className="ll-mark-glint" r={70} fill={ref("glint")} />
          <g className="ll-mark-sheen" style={vars({ "--d": s(SHEEN_AT), "--to": `${w + 150}px` })}>
            <rect x={-40} y={-20} width={48} height={h + 40} fill={ref("sheen")} transform="skewX(-20)" />
          </g>
        </g>
      </svg>
    </span>
  );
}
