"""Build src/geo/nyc-boroughs.json (small, pre-projected borough outlines).

Source: NYC Open Data "Borough Boundaries" (dataset gthc-hcne), City of New
York / Department of City Planning. Download it, then run from the repo root:

    curl -o boroughs.geojson https://data.cityofnewyork.us/resource/gthc-hcne.geojson
    python3 app/frontend/scripts/make_nyc_geo.py boroughs.geojson

Polygons are projected (equirectangular, scaled by cos(latitude)) into an
820 x 410 drawing box, simplified (Ramer-Douglas-Peucker) and tiny islands
are dropped. Standard library only.
"""

import json
import math
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "src" / "geo" / "nyc-boroughs.json"
W, H, PAD = 820, 410, 14
TOL = 0.9       # simplification tolerance, drawing pixels
MIN_AREA = 40   # drop rings smaller than this many square pixels


def rdp(pts, tol):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-12
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            dmax, idx = d, i
    if dmax <= tol:
        return [pts[0], pts[-1]]
    return rdp(pts[: idx + 1], tol)[:-1] + rdp(pts[idx:], tol)


def area(ring):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]))) / 2


def main(src):
    sys.setrecursionlimit(20000)  # long coastline rings
    feats = json.load(open(src, encoding="utf-8"))["features"]
    polys = []  # (name, [outer rings]) ; holes ignored at this scale
    for f in feats:
        name = f["properties"].get("boroname") or f["properties"].get("BoroName")
        g = f["geometry"]
        parts = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        polys.append((name, [p[0] for p in parts]))
    lons = [x for _, rs in polys for r in rs for x, _ in r]
    lats = [y for _, rs in polys for r in rs for _, y in r]
    lat0 = (min(lats) + max(lats)) / 2
    kx = math.cos(math.radians(lat0))
    sx = (W - 2 * PAD) / ((max(lons) - min(lons)) * kx)
    sy = (H - 2 * PAD) / (max(lats) - min(lats))
    s = min(sx, sy)
    ox = (W - (max(lons) - min(lons)) * kx * s) / 2
    oy = (H - (max(lats) - min(lats)) * s) / 2
    proj = lambda lon, lat: ((lon - min(lons)) * kx * s + ox, (max(lats) - lat) * s + oy)

    out = []
    for name, rings in polys:
        keep = []
        for r in rings:
            pts = [proj(x, y) for x, y in r]
            mid = len(pts) // 2  # a closed ring starts and ends on the same point: simplify two halves
            pr = rdp(pts[: mid + 1], TOL)[:-1] + rdp(pts[mid:], TOL)
            if len(pr) >= 4 and area(pr) >= MIN_AREA:
                keep.append([[round(x, 1), round(y, 1)] for x, y in pr])
        keep.sort(key=area, reverse=True)
        out.append({"name": name, "rings": keep})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "NYC Open Data, Borough Boundaries (gthc-hcne), City of New York / Department of City Planning",
        "width": W, "height": H, "boroughs": out,
    }, separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes):",
          {b["name"]: sum(len(r) for r in b["rings"]) for b in out})


if __name__ == "__main__":
    main(sys.argv[1])
