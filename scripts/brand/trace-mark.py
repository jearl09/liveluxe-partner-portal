"""
Trace the Live Luxe monogram (liveluxelogo2.jpeg, gold on cream) into vector form.

Writes:
  public/brand/liveluxe-mark.svg      the static mark, one <path> per shape, Antique Gold
  components/auth/brand-mark-data.ts  the same outlines plus each shape's pen path (centreline split
                                      into short pieces with a nib width), used by <BrandMark> to draw
                                      the mark on as if written

Needs: numpy, scipy, pillow, scikit-image, potracer. Run once; the outputs are committed.
  python -m venv .venv-brand && .venv-brand/Scripts/pip install numpy scipy pillow scikit-image potracer
  .venv-brand/Scripts/python scripts/brand/trace-mark.py
"""
import heapq
import math
import os

import numpy as np
import potrace
from PIL import Image
from scipy import ndimage as ndi
from skimage.morphology import skeletonize

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "liveluxelogo2.jpeg")

# Source pixels → output units. The mark sits in x 321–1279, y 241–1359 of the 1600 px source.
OX, OY, K = 313, 233, 0.25
VIEW_W, VIEW_H = round((1287 - OX) * K, 1), round((1367 - OY) * K, 1)


def P(x, y):
    return f"{(x - OX) * K:.1f} {(y - OY) * K:.1f}".replace(".0 ", " ").removesuffix(".0")


# ---------------------------------------------------------------- mask and shapes
img = np.asarray(Image.open(SRC).convert("RGB")).astype(float)
blue = ndi.gaussian_filter(img[:, :, 2], 1.6)  # gold has little blue; cream has a lot
mask = blue < (96 + 247) / 2
mask = ndi.binary_opening(mask, iterations=1)
labels, n = ndi.label(mask)
assert n == 5, f"expected 5 shapes, found {n}"


def label_at(x, y):
    v = labels[y, x]
    assert v, f"no shape at {x},{y}"
    return v


# Shapes, in the order they are written. "Thick strokes first, the script last."
SHAPES = {
    "i-cap": label_at(645, 350),  # the I above the C
    "i-stem": label_at(645, 800),  # the I below the C, with its foot serif
    "l-foot": label_at(1110, 1060),  # the roman L's foot on the right
    "c-arc": label_at(395, 700),  # the open C sweeping round the I
    "script": label_at(860, 700),  # the script L: loop, stem, lower loop and swash, and its crossbar
}

# ---------------------------------------------------------------- outlines (potrace)


def outline(lbl):
    bm = potrace.Bitmap(labels != lbl)  # potracer traces the dark (False) pixels
    plist = bm.trace(turdsize=20, alphamax=1.0, opticurve=True, opttolerance=0.3)
    out = []
    def Q(pt):  # potracer points are objects with x and y
        return P(pt.x, pt.y)

    for curve in plist:
        parts = [f"M{Q(curve.start_point)}"]
        for seg in curve.segments:
            if seg.is_corner:
                parts.append(f"L{Q(seg.c)}L{Q(seg.end_point)}")
            else:
                parts.append(f"C{Q(seg.c1)} {Q(seg.c2)} {Q(seg.end_point)}")
        out.append("".join(parts) + "Z")
    return "".join(out)


# ---------------------------------------------------------------- pen paths
skel = skeletonize(mask)
dist = ndi.distance_transform_edt(mask)  # half the stroke width at each skeleton pixel


def skeleton_route(lbl, a, b):
    """Shortest walk along this shape's skeleton from the pixel nearest a to the pixel nearest b."""
    ys, xs = np.nonzero(skel & (labels == lbl))
    pts = set(zip(xs.tolist(), ys.tolist()))

    def snap(p):
        i = np.argmin((xs - p[0]) ** 2 + (ys - p[1]) ** 2)
        return int(xs[i]), int(ys[i])

    s, t = snap(a), snap(b)
    best, prev, heap = {s: 0.0}, {}, [(0.0, s)]
    while heap:
        d, u = heapq.heappop(heap)
        if u == t:
            break
        if d > best.get(u, 1e18):
            continue
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                v = (u[0] + dx, u[1] + dy)
                if v == u or v not in pts:
                    continue
                nd = d + math.hypot(dx, dy)
                if nd < best.get(v, 1e18):
                    best[v], prev[v] = nd, u
                    heapq.heappush(heap, (nd, v))
    path, u = [t], t
    while u != s:
        u = prev[u]
        path.append(u)
    return path[::-1]


def resample(pts, step):
    """Even spacing along a polyline, after a light smoothing so the skeleton's pixel stairs vanish."""
    a = np.array(pts, float)
    if len(a) > 9:
        a = np.stack([ndi.uniform_filter1d(a[:, i], 9, mode="nearest") for i in (0, 1)], 1)
    seg = np.hypot(*np.diff(a, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    total = s[-1]
    m = max(2, int(total / step) + 1)
    q = np.linspace(0, total, m)
    return np.stack([np.interp(q, s, a[:, 0]), np.interp(q, s, a[:, 1])], 1)


def nib(lbl, x, y, r=6):
    """Local stroke width: twice the largest distance-to-edge near this point, inside this shape."""
    x0, y0 = int(round(x)), int(round(y))
    win = dist[y0 - r : y0 + r + 1, x0 - r : x0 + r + 1] * (labels[y0 - r : y0 + r + 1, x0 - r : x0 + r + 1] == lbl)
    return 2 * float(win.max())


def pen(lbl, waypoints, follow=True, width=None, piece=72):
    """
    One pen stroke as short pieces, each with its own nib width, so a thin hairline is not revealed by a fat
    mask and a crossing strand is not uncovered early. follow=False draws straight lines between the points
    (serifs and stems, where the skeleton branches into the brackets).
    """
    if not follow:  # straight runs need no splitting: one piece per leg, at the given width
        return [
            {"d": f"M{P(*a)}L{P(*b)}", "len": round(math.dist(a, b) * K, 2), "w": round(width * K, 1)}
            for a, b in zip(waypoints, waypoints[1:])
        ]
    pts = []
    for a, b in zip(waypoints, waypoints[1:]):
        r = skeleton_route(lbl, a, b)
        pts.extend(r if not pts else r[1:])
    a = resample(pts, 6)
    pieces, i = [], 0
    while i < len(a) - 1:
        j = min(len(a) - 1, i + max(2, int(piece / 6)))
        chunk = a[i : j + 1]
        w = max(nib(lbl, x, y) for x, y in chunk) * 1.3 + 8
        length = float(np.hypot(*np.diff(chunk, axis=0).T).sum())
        # Four points per piece is plenty at this size: a piece is about 18 units long.
        keep = chunk[np.unique(np.linspace(0, len(chunk) - 1, 4).round().astype(int))]
        d = "M" + "L".join(P(x, y) for x, y in keep.tolist())
        pieces.append({"d": d, "len": round(length * K, 2), "w": round(w * K, 1)})
        i = j
    return pieces


STROKES = {
    # Serif left to right, then the stem down. The brackets fall inside the wide nib.
    "i-cap": [
        pen(SHAPES["i-cap"], [(512, 254), (786, 254)], follow=False, width=64),
        pen(SHAPES["i-cap"], [(645, 262), (645, 490)], follow=False, width=190),
    ],
    # Stem down, then the foot serif left to right.
    "i-stem": [
        pen(SHAPES["i-stem"], [(645, 500), (645, 1070)], follow=False, width=180),
        pen(SHAPES["i-stem"], [(512, 1084), (800, 1084)], follow=False, width=60),
    ],
    # Down the upright edge, then along the foot to its tip.
    "l-foot": [pen(SHAPES["l-foot"], [(1118, 866), (1118, 1066), (866, 1086)], follow=False, width=150)],
    # From the upper tip, over the top and round to the lower tip.
    "c-arc": [
        pen(
            SHAPES["c-arc"],
            [(815, 585), (700, 505), (580, 490), (470, 515), (400, 600), (398, 700), (450, 800), (558, 882)],
        )
    ],
    # The script L in one movement: up the loop, over, down the stem, round the lower loop and out along the swash.
    # Then the crossbar, last, like crossing a t.
    "script": [
        pen(
            SHAPES["script"],
            [
                (905, 866), (1000, 815), (1100, 720), (1160, 600), (1150, 470), (1070, 432), (960, 470),
                (900, 550), (868, 650), (860, 760), (857, 880), (850, 960), (838, 1060), (790, 1140),
                (742, 1236), (700, 1265), (630, 1315), (450, 1340), (340, 1245), (400, 1170), (500, 1160),
                (630, 1190), (742, 1236), (800, 1262), (900, 1300), (1050, 1345), (1200, 1300),
                (1265, 1220), (1262, 1170),
            ],
        ),
        pen(SHAPES["script"], [(726, 903), (856, 896)], follow=False, width=44),
    ],
}

# ---------------------------------------------------------------- write
outlines = {name: outline(lbl) for name, lbl in SHAPES.items()}
os.makedirs(os.path.join(ROOT, "public", "brand"), exist_ok=True)

svg = [
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW_W:g} {VIEW_H:g}" role="img" aria-label="Live Luxe">',
    "<title>Live Luxe</title>",
    '<g fill="#D3AC60" fill-rule="evenodd">',
    *[f'<path id="{name}" d="{d}"/>' for name, d in outlines.items()],
    "</g></svg>",
]
with open(os.path.join(ROOT, "public", "brand", "liveluxe-mark.svg"), "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(svg) + "\n")

ts = [
    "// Generated by scripts/brand/trace-mark.py from liveluxelogo2.jpeg. Do not edit by hand.",
    "",
    "/** A short piece of a pen stroke: its path, its length and the nib width that covers it. */",
    "export type PenPiece = { d: string; len: number; w: number };",
    "",
    "export type MarkShape = {",
    "  id: \"i-cap\" | \"i-stem\" | \"l-foot\" | \"c-arc\" | \"script\";",
    "  /** The filled outline (even-odd: the loops are holes). */",
    "  d: string;",
    "  /** Pen strokes in writing order; each is a run of pieces drawn end to end. */",
    "  strokes: PenPiece[][];",
    "};",
    "",
    f"export const MARK_VIEWBOX = {{ w: {VIEW_W:g}, h: {VIEW_H:g} }};",
    "",
    "export const MARK_SHAPES: MarkShape[] = [",
]
for name, d in outlines.items():
    ts.append(f'  {{\n    id: "{name}",\n    d: "{d}",\n    strokes: [')
    for stroke in STROKES[name]:
        ts.append("      [")
        for p in stroke:
            ts.append(f'        {{ d: "{p["d"]}", len: {p["len"]:g}, w: {p["w"]:g} }},')
        ts.append("      ],")
    ts.append("    ],\n  },")
ts.append("];")
with open(os.path.join(ROOT, "components", "auth", "brand-mark-data.ts"), "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(ts) + "\n")

for name in SHAPES:
    pieces = [p for s in STROKES[name] for p in s]
    print(f"{name:7} outline {len(outlines[name]):5} chars, {len(pieces):3} pen pieces, {sum(p['len'] for p in pieces):7.1f} long")
print("svg", os.path.getsize(os.path.join(ROOT, "public", "brand", "liveluxe-mark.svg")), "bytes;",
      "data", os.path.getsize(os.path.join(ROOT, "components", "auth", "brand-mark-data.ts")), "bytes")
