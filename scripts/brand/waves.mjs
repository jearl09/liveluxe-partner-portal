#!/usr/bin/env node
/**
 * The canvas pattern (polish pass, 16 Oct 2026): flowing lines behind the page, like silk by day and like contour
 * lines on Docklands water at night. Generated once; paste the output into app/globals.css as `--canvas-pattern`
 * in the light block and both dark blocks. Deterministic (no randomness), so a re-run gives the same SVG.
 *
 *   node scripts/brand/waves.mjs
 *
 * Light: cream page, white sheen strokes and Antique Gold (#D3AC60) strokes at low opacity.
 * Dark: fine gold contour lines on Harbour Navy, fainter still.
 */

const W = 1600;
const H = 720;

/** One flowing line: a sum of two slow sines whose phase drifts with the line index, so neighbours fold together. */
function line(i, n, { base, spread, amp }) {
  const t = i / (n - 1);
  const y0 = base + t * spread;
  const pts = [];
  for (let x = -80; x <= W + 80; x += 80) {
    const u = x / W;
    const y =
      y0 +
      amp * (0.9 - 0.5 * t) * Math.sin(2 * Math.PI * (u * 1.15 + 0.12 * i / n + 0.08)) +
      amp * 0.45 * Math.sin(2 * Math.PI * (u * 2.3 - 0.21 * t) + 1.3) +
      amp * 0.18 * Math.sin(2 * Math.PI * (u * 4.1 + 0.33 * t));
    pts.push([x, y]);
  }
  // Catmull-Rom through the points, as cubic Béziers, for a smooth silk curve.
  let d = `M${pts[0][0]} ${pts[0][1].toFixed(0)}`;
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = pts[Math.max(0, k - 1)];
    const p1 = pts[k];
    const p2 = pts[k + 1];
    const p3 = pts[Math.min(pts.length - 1, k + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(0)} ${c1[1].toFixed(0)} ${c2[0].toFixed(0)} ${c2[1].toFixed(0)} ${p2[0]} ${p2[1].toFixed(0)}`;
  }
  return d;
}

function svg(paths) {
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='xMidYMin slice' fill='none'>${paths.join("")}</svg>`;
}

/** Silk: 18 lines; every third a white sheen, the rest gold, opacity rising toward the fold. */
function light() {
  const n = 18;
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = line(i, n, { base: 40, spread: 470, amp: 120 });
    if (i % 3 === 1) {
      out.push(`<path d='${d}' stroke='%23ffffff' stroke-opacity='0.6' stroke-width='1.8'/>`);
    } else {
      const o = (0.1 + 0.12 * Math.sin((Math.PI * i) / (n - 1))).toFixed(3);
      out.push(`<path d='${d}' stroke='%23D3AC60' stroke-opacity='${o}' stroke-width='1.1'/>`);
    }
  }
  return svg(out);
}

/** Contours: 26 fine gold lines, closer together, fainter than by day. */
function dark() {
  const n = 26;
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = line(i, n, { base: 30, spread: 520, amp: 105 });
    const o = (0.06 + 0.06 * Math.sin((Math.PI * i) / (n - 1))).toFixed(3);
    out.push(`<path d='${d}' stroke='%23D3AC60' stroke-opacity='${o}' stroke-width='0.8'/>`);
  }
  return svg(out);
}

const uri = (s) => `url("data:image/svg+xml,${s.replace(/</g, "%3C").replace(/>/g, "%3E")}")`;
const l = uri(light());
const d = uri(dark());
console.log(`/* light */\n--canvas-pattern: ${l};\n`);
console.log(`/* dark */\n--canvas-pattern: ${d};\n`);
console.error(`sizes: light ${l.length} B, dark ${d.length} B`);
