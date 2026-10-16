#!/usr/bin/env node
/**
 * Generates docs/ux/DESIGN_TOKENS.md from app/globals.css: every colour role in both
 * themes with the measured WCAG contrast of the pairs that matter (brief §10.2).
 * Run after any token change: `node scripts/design-tokens-contrast.mjs`.
 */
import { readFileSync, writeFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");

function block(selectorRe) {
  const m = css.match(selectorRe);
  if (!m) throw new Error(`block not found: ${selectorRe}`);
  const vars = {};
  for (const [, name, value] of m[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) vars[name] = value.trim();
  return vars;
}
const light = block(/:root\s*\{([\s\S]*?)\n\}/);
const dark = { ...light, ...block(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/) };

function resolve(vars, value, depth = 0) {
  if (depth > 10) return value;
  const m = value.match(/^var\(--([a-z0-9-]+)\)$/);
  if (m) return resolve(vars, vars[m[1]] ?? value, depth + 1);
  return value;
}
function hex(vars, name) {
  const v = resolve(vars, vars[name] ?? "");
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
}
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function lum(h) {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

const ROLES = [
  "bg-canvas",
  "bg-surface",
  "bg-surface-raised",
  "bg-inset",
  "bg-field",
  "border-subtle",
  "border-strong",
  "text-primary",
  "text-secondary",
  "text-muted",
  "accent-gold",
  "accent-gold-hover",
  "text-on-gold",
  "text-gold",
  "focus-ring",
  "surface-navy",
  "text-on-navy",
  "text-on-navy-muted",
  ...["info", "attention", "success", "danger", "muted"].flatMap((t) => [
    `status-${t}-bg`,
    `status-${t}-fg`,
    `status-${t}-border`,
  ]),
];

/** [foreground, background, floor, note] */
const PAIRS = [
  ["text-primary", "bg-surface", 7, "body headings on cards"],
  ["text-primary", "bg-canvas", 7, "headings on the page"],
  ["text-primary", "bg-inset", 7, "text in wells"],
  ["text-primary", "bg-field", 7, "text in fields"],
  ["text-secondary", "bg-surface", 4.5, "running text on cards"],
  ["text-secondary", "bg-canvas", 4.5, "running text on the page"],
  ["text-secondary", "bg-inset", 4.5, "running text in wells"],
  ["text-muted", "bg-surface", 4.5, "captions, timestamps"],
  ["text-muted", "bg-canvas", 4.5, "captions on the page"],
  ["text-muted", "bg-inset", 4.5, "captions in wells"],
  ["text-muted", "bg-field", 4.5, "placeholders and hints in fields"],
  ["text-on-gold", "accent-gold", 4.5, "primary button label"],
  ["text-on-gold", "accent-gold-hover", 4.5, "primary button label, hover"],
  ["text-gold", "bg-surface", 4.5, "eyebrow, active nav"],
  ["text-gold", "bg-canvas", 4.5, "eyebrow on the page"],
  ["text-on-navy", "surface-navy", 4.5, "ops header text"],
  ["text-on-navy-muted", "surface-navy", 4.5, "ops header secondary"],
  ["accent-gold", "surface-navy", 3, "ops header underline / eyebrow (UI)"],
  ["border-strong", "bg-surface", 3, "outline-button and calendar-cell edge (UI)"],
  ["border-field", "bg-surface", 3, "input edge on a card (UI)"],
  ["border-field", "bg-field", 3, "input edge against its own fill (UI)"],
  ["border-field", "bg-canvas", 3, "input edge on the page (UI)"],
  ["focus-ring", "bg-canvas", 3, "focus ring on the page (UI)"],
  ["focus-ring", "bg-surface", 3, "focus ring on a card (UI)"],
  ...["info", "attention", "success", "danger", "muted"].flatMap((t) => [
    [`status-${t}-fg`, `status-${t}-bg`, 4.5, `${t} pill text on its tint`],
    [`status-${t}-fg`, `bg-surface`, 4.5, `${t} text on a card`],
  ]),
];

const fmt = (n, floor) => `${n.toFixed(2)}${n >= floor ? " ✓" : " ✗"}`;
const lines = [
  "# Design tokens — measured contrast",
  "",
  `Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/design-tokens-contrast.mjs\` from \`app/globals.css\`. Do not edit by hand.`,
  "",
  "Floors: text ≥ 4.5:1 (primary text ≥ 7:1 by the brief), UI boundaries ≥ 3:1 (WCAG 2.2 AA, brief §10.2).",
  "",
  "## Roles",
  "",
  "| Role | Light | Dark |",
  "| --- | --- | --- |",
  ...ROLES.map((r) => `| \`${r}\` | \`${hex(light, r) ?? "—"}\` | \`${hex(dark, r) ?? "—"}\` |`),
  "",
  "## Measured pairs",
  "",
  "| Foreground | Background | Use | Floor | Light | Dark |",
  "| --- | --- | --- | --- | --- | --- |",
];
let failures = 0;
for (const [fg, bg, floor, note] of PAIRS) {
  const l = hex(light, fg) && hex(light, bg) ? ratio(hex(light, fg), hex(light, bg)) : null;
  const d = hex(dark, fg) && hex(dark, bg) ? ratio(hex(dark, fg), hex(dark, bg)) : null;
  if ((l !== null && l < floor) || (d !== null && d < floor)) failures++;
  lines.push(
    `| \`${fg}\` | \`${bg}\` | ${note} | ${floor}:1 | ${l === null ? "—" : fmt(l, floor)} | ${d === null ? "—" : fmt(d, floor)} |`,
  );
}
lines.push("", `Pairs below their floor: **${failures}**.`, "");
lines.push(
  "## Notes",
  "",
  "- Status `-border` values are tints inside the pill's own background and are not UI boundaries (DECISIONS.md #10).",
  "- `text-on-gold` is navy in both themes; white on Antique Gold measures 2.1:1 and is never used.",
  "- Light `focus-ring` is Gold Ink because Antique Gold on cream measures 2.0:1 (DECISIONS.md #6).",
  "- The Antique Gold active-nav underline measures 2.0:1 on cream; it reinforces an active state already carried by `text-gold` text and `aria-current`, so it is not a boundary (DECISIONS.md #13).",
  "",
);
writeFileSync("docs/ux/DESIGN_TOKENS.md", lines.join("\n"));
console.log(`docs/ux/DESIGN_TOKENS.md written; ${PAIRS.length} pairs, ${failures} below floor`);
if (failures) process.exitCode = 2;
