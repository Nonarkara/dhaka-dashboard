#!/usr/bin/env python3
"""
bake-buildings.py — Overture Maps buildings → Greater Dhaka 3D PMTiles.

Conservation law: every footprint in the bbox is drawn once, at a height in
real metres, and says where that height came from:
  measured  = Overture `height` (OSM tag or survey)
  floors    = Overture `num_floors` × 3.3 m
  google    = Google Open Buildings 2.5D Temporal (2023): p75 of the
              per-pixel building_height inside this footprint
  ghsl      = GHSL built-up height (EU JRC, 2018): the average building
              height of the footprint's 100 m cell (where Google has none)
  estimated = unknown height, flat footprint (0 m — never invented class defaults)

Satellite heights are capped at max(6 m, 4 × sqrt(footprint area)) so a
3×3 m sliver can't stand 30 m tall.
No multiplier. Every building carries `hs` (height source) and `src` (footprint source).

Usage:
  python3 scripts/bake-buildings.py extract   # Overture S3 → out/overture-*.parquet
  python3 scripts/bake-buildings.py heights   # Google 2.5D height tiles → out/ob25d/
  python3 scripts/bake-buildings.py bake      # parquet + heights → out/dhaka-buildings.pmtiles
  npx wrangler r2 object put dhaka-observations/tiles/dhaka-buildings-v1.pmtiles \
      --file out/dhaka-buildings.pmtiles --remote

Data: © OpenStreetMap contributors (ODbL), Microsoft (ODbL), Google (CC BY 4.0 / ODbL),
via Overture Maps Foundation. Heights: Google Open Buildings 2.5D Temporal (2023),
GHS-BUILT-H R2023A, European Commission JRC (CC BY 4.0).
"""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import duckdb
import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

RELEASE = "2026-11-18.0"
# Greater Metropolitan Dhaka: covers all 14 curated areas (Old Dhaka, Motijheel,
# Parliament, Hatirjheel, Gulshan, Banani, Kawran Bazar, Uttara, Mirpur,
# Dhanmondi, Tejgaon, Chawkbazar, Sadarghat, Savar-Ashulia, Narayanganj).
BBOX = (90.25, 23.61, 90.53, 23.93)
UTM_EPSG = 32646  # UTM 46N
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
S3 = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=buildings/type="
GHSL_BASE = (
    "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_H_GLOBE_R2023A/"
    "GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss/V1-0/tiles"
)
GHSL_TILE = "GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss_V1_0_R7_C28"  # 90-100 E, 21-31 N
GHSL_DIR = OUT / "ghsl"

# Per-building heights: Google Open Buildings 2.5D Temporal (2023)
OB25D = "https://storage.googleapis.com/open-buildings-temporal-data/v1/manifests/{}_EPSG_32646_2023_06_30.json"
OB25D_CELLS = ("37",)
OB25D_DIR = OUT / "ob25d"
G_PX = 2.0  # metres per pixel we sample at

SRC_CODE = {
    "OpenStreetMap": "osm",
    "Microsoft ML Buildings": "ms",
    "Google Open Buildings": "google",
}


def con():
    c = duckdb.connect()
    c.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
    return c


def utm():
    return Transformer.from_crs(4326, UTM_EPSG, always_xy=True)


def extract():
    OUT.mkdir(parents=True, exist_ok=True)
    tif = GHSL_DIR / f"{GHSL_TILE}.tif"
    if not tif.exists():
        print(f"download GHSL built-up height tile {GHSL_TILE}", flush=True)
        GHSL_DIR.mkdir(parents=True, exist_ok=True)
        z = OUT / f"{GHSL_TILE}.zip"
        urllib.request.urlretrieve(f"{GHSL_BASE}/{GHSL_TILE}.zip", z)
        zipfile.ZipFile(z).extract(f"{GHSL_TILE}.tif", GHSL_DIR)
    x0, y0, x1, y1 = BBOX
    where = f"bbox.xmin >= {x0} AND bbox.xmax <= {x1} AND bbox.ymin >= {y0} AND bbox.ymax <= {y1}"
    c = con()
    for kind, extra in (
        ("building", "class, has_parts"),
        ("building_part", "NULL AS class, min_height, building_id"),
    ):
        dst = OUT / f"overture-{kind}.parquet"
        if dst.exists() and dst.stat().st_size > 0:
            print(f"keep {dst.name} (delete it to re-extract)")
            continue
        print(f"extract {kind} → {dst}", flush=True)
        c.execute(f"""
            COPY (
              SELECT id, geometry, height, num_floors,
                     names.primary AS name, sources[1].dataset AS src, {extra}
              FROM read_parquet('{S3}{kind}/*', hive_partitioning=1)
              WHERE {where}
            ) TO '{dst}' (FORMAT parquet)
        """)
        print(" ", c.execute(f"SELECT count(*) FROM '{dst}'").fetchone()[0], "rows", flush=True)


class Ghsl:
    """Average net building height per 3-arcsecond (~100 m) cell."""

    def __init__(self):
        with rasterio.open(GHSL_DIR / f"{GHSL_TILE}.tif") as r:
            win = from_bounds(*BBOX, transform=r.transform).round_offsets().round_lengths()
            if (
                win.row_off < 0
                or win.col_off < 0
                or win.row_off + win.height > r.height
                or win.col_off + win.width > r.width
            ):
                raise SystemExit(
                    f"Dhaka: bbox {BBOX} falls outside GHSL tile {GHSL_TILE} "
                    f"({r.bounds.left:.3f},{r.bounds.bottom:.3f}..{r.bounds.right:.3f},{r.bounds.top:.3f})."
                )
            self.a = r.read(1, window=win)
            self.t = r.window_transform(win)

    def at(self, x, y):
        col, row = ~self.t * (x, y)
        row, col = int(row), int(col)
        if 0 <= row < self.a.shape[0] and 0 <= col < self.a.shape[1]:
            return float(self.a[row, col])
        return 0.0


def heights():
    """Download the 2023 building_height band for every tile under BBOX."""
    OB25D_DIR.mkdir(parents=True, exist_ok=True)
    t = utm()
    x0, y0 = t.transform(BBOX[0], BBOX[1])
    x1, y1 = t.transform(BBOX[2], BBOX[3])
    jobs = []
    for cell in OB25D_CELLS:
        m = json.load(urllib.request.urlopen(OB25D.format(cell)))
        pre = m["uriPrefix"].replace("gs://", "https://storage.googleapis.com/")
        for ts in m["tilesets"]:
            for src in ts["sources"]:
                a = src["affineTransform"]
                tx, ty, size = a["translateX"], a["translateY"], src["dimensions"]["width"] * a["scaleX"]
                if tx < x1 and tx + size > x0 and ty > y0 and ty - size < y1:
                    jobs.append((pre + src["uris"][0], tx, ty, size))
    print(len(jobs), "tiles", flush=True)
    if not jobs:
        raise SystemExit(f"Dhaka: no Open Buildings 2.5D tiles found for bbox {BBOX}.")

    def fetch(job):
        url, tx, ty, size = job
        dst = OB25D_DIR / (url.split("/")[-2] + "_" + url.split("/")[-1])
        if dst.exists():
            return
        n = int(size / G_PX)
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MULTIRANGE="YES"):
            with rasterio.open("/vsicurl/" + url) as r:
                h = r.read(2, out_shape=(n, n), resampling=Resampling.nearest)
        dm = np.where(h > 0, np.round(h * 10), 0).astype("int16")
        if not dm.any():
            dm = dm[:1, :1]
        prof = dict(
            driver="GTiff",
            width=dm.shape[1],
            height=dm.shape[0],
            count=1,
            dtype="int16",
            crs=f"EPSG:{UTM_EPSG}",
            transform=rasterio.transform.from_origin(tx, ty, G_PX, G_PX),
            compress="deflate",
            predictor=2,
            tiled=True,
        )
        with rasterio.open(dst, "w", **prof) as w:
            w.write(dm, 1)
        print("  ", dst.name, flush=True)

    with ThreadPoolExecutor(6) as ex:
        list(ex.map(fetch, jobs))


def google_p75(geoms_utm, cx, cy):
    """75th percentile of building_height pixels inside each footprint."""
    import pandas as pd
    from rasterio.features import rasterize

    out = np.full(len(geoms_utm), np.nan)
    for tif in sorted(OB25D_DIR.glob("*.tif")):
        with rasterio.open(tif) as r:
            if r.width < 2:
                continue
            b = r.bounds
            sel = np.flatnonzero(
                np.isnan(out) & (cx >= b.left) & (cx < b.right) & (cy > b.bottom) & (cy <= b.top)
            )
            if not len(sel):
                continue
            h = r.read(1)
            ids = rasterize(
                zip(geoms_utm[sel], np.arange(1, len(sel) + 1)),
                out_shape=h.shape,
                transform=r.transform,
                fill=0,
                dtype="int32",
            )
        m = (ids > 0) & (h > 0)
        q = pd.Series(h[m] / 10.0).groupby(ids[m]).quantile(0.75)
        got = np.full(len(sel), np.nan)
        got[q.index.values - 1] = q.values
        miss = np.isnan(got)
        if miss.any():
            col = ((cx[sel][miss] - b.left) / G_PX).astype(int).clip(0, h.shape[1] - 1)
            row = ((b.top - cy[sel][miss]) / G_PX).astype(int).clip(0, h.shape[0] - 1)
            v = h[row, col] / 10.0
            got[np.flatnonzero(miss)] = np.where(v > 0, v, np.nan)
        out[sel] = got
        print("  ", tif.name, len(sel), "footprints", int((~np.isnan(got)).sum()), "with height", flush=True)
    return out


def bake():
    import shapely

    if not list(OB25D_DIR.glob("*.tif")):
        raise SystemExit(f"Dhaka: no 2.5D height tiles in {OB25D_DIR}. Run `heights` first.")
    c = con()
    cols = "ST_AsWKB(geometry) AS wkb, height, num_floors, class, name, src"
    df = c.execute(f"""
        SELECT {cols}, 0.0 AS base FROM '{OUT}/overture-building.parquet' WHERE NOT coalesce(has_parts, false)
        UNION ALL
        SELECT {cols}, coalesce(min_height, 0) FROM '{OUT}/overture-building_part.parquet'
        UNION ALL
        SELECT {cols}, 0.0 FROM '{OUT}/overture-building.parquet' b WHERE coalesce(b.has_parts, false)
          AND NOT EXISTS (SELECT 1 FROM '{OUT}/overture-building_part.parquet' p WHERE p.building_id = b.id)
    """).df()
    print(len(df), "footprints", flush=True)
    geoms = shapely.from_wkb([bytes(b) for b in df.wkb.values])
    cen = shapely.centroid(geoms)

    t = utm()
    gu = shapely.transform(geoms, lambda xy: np.column_stack(t.transform(xy[:, 0], xy[:, 1])))
    area = shapely.area(gu)
    cx, cy = t.transform(shapely.get_x(cen), shapely.get_y(cen))
    goog = google_p75(gu, np.asarray(cx), np.asarray(cy))

    ghsl = Ghsl()
    lon, lat = shapely.get_x(cen), shapely.get_y(cen)
    sat = np.array([ghsl.at(x, y) for x, y in zip(lon, lat)])

    # Geographic truth ladder:
    #   measured -> floors -> google (2023 2.5D) -> ghsl (2018) -> unknown flat (0 m)
    meas = df.height.values.astype(float)
    flo = df.num_floors.values.astype(float) * 3.3
    cap = np.maximum(6.0, 4.0 * np.sqrt(area))
    h = np.where((meas >= 1) & (meas <= 500), meas, np.nan)
    hs = np.where(~np.isnan(h), "measured", "").astype(object)
    use = np.isnan(h) & (flo >= 3) & (flo <= 400)
    h[use], hs[use] = flo[use], "floors"
    use = np.isnan(h) & (goog >= 2.5)
    h[use], hs[use] = np.minimum(goog[use], cap[use]), "google"
    use = np.isnan(h) & (sat >= 3)
    h[use], hs[use] = np.minimum(np.minimum(sat[use], 60.0), cap[use]), "ghsl"
    use = np.isnan(h)
    h[use], hs[use] = 0.0, "estimated"
    h = np.round(h, 1)
    base = df.base.values.astype(float)
    base = np.where((base > 0) & (base < h), np.round(base, 1), 0)

    geojsonl = OUT / "dhaka-buildings.geojsonl"
    gj = shapely.to_geojson(geoms)
    src = [SRC_CODE.get(v, "other") for v in df.src.values]
    with geojsonl.open("w") as fh:
        for i in range(len(df)):
            props = {"h": float(h[i]), "b": float(base[i]), "hs": hs[i], "src": src[i]}
            if df["class"].values[i]:
                props["cls"] = df["class"].values[i]
            if df.name.values[i]:
                props["name"] = df.name.values[i]
            fh.write(
                '{"type":"Feature","geometry":'
                + gj[i]
                + ',"properties":'
                + json.dumps(props, ensure_ascii=False)
                + "}\n"
            )

    n = len(df)
    stats = {k: int((hs == k).sum()) for k in ("measured", "floors", "google", "ghsl", "estimated")}
    srcs = {k: src.count(k) for k in set(src)}
    print(f"{n} features")
    for k, v in stats.items():
        print(f"  height {k:9} {v:8}  {100 * v / n:5.1f}%")
    nonzero = h[h > 0]
    if len(nonzero):
        print("  nonzero height p50/p90/p99/max", np.percentile(nonzero, [50, 90, 99]).round(1), nonzero.max())
    (OUT / "dhaka-buildings.stats.json").write_text(
        json.dumps({"count": n, "bbox": list(BBOX), "release": RELEASE, "height": stats, "source": srcs}, indent=2)
    )

    pm = OUT / "dhaka-buildings.pmtiles"
    subprocess.run(
        [
            "tippecanoe",
            "-o",
            str(pm),
            "--force",
            "--layer=buildings",
            "--minimum-zoom=12",
            "--maximum-zoom=15",
            "--drop-densest-as-needed",
            "--extend-zooms-if-still-dropping",
            "--simplification=4",
            "--read-parallel",
            "--generate-ids",
            "--attribution=© OpenStreetMap, Microsoft, Google via Overture Maps; heights Google Open Buildings 2.5D (2023), GHSL (EC JRC 2018)",
            str(geojsonl),
        ],
        check=True,
    )
    print(pm, round(pm.stat().st_size / 1_000_000, 1), "MB")


COMMANDS = {"extract": extract, "heights": heights, "bake": bake}


def main(argv):
    cmd = argv[0] if argv else "bake"
    if cmd not in COMMANDS:
        raise SystemExit(f"unknown command {cmd!r}; use: {', '.join(COMMANDS)}")
    COMMANDS[cmd]()


if __name__ == "__main__":
    main(sys.argv[1:])
