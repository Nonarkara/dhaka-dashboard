#!/usr/bin/env python3
"""
bake-osm-layers.py — OpenStreetMap waterways and rail for the Greater Dhaka atlas.

  rail       public/data/dhaka-rail-osm.geojson   MRT Line 6 and Bangladesh Railway
                                                  route ways & stations in Greater Dhaka
  waterways  out/dhaka-waterways.pmtiles          Buriganga, Turag, Balu, Shitalakshya,
                                                  Tongi Khal, Dhaleshwari, Hatirjheel,
                                                  urban canals and lakes

Data © OpenStreetMap contributors, ODbL.
"""
import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BBOX = (90.25, 23.61, 90.53, 23.93)
S, W, N, E = BBOX[1], BBOX[0], BBOX[3], BBOX[2]
OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
UA = "dhaka-3d-atlas/1.0 (https://dhaka.nonarkara.org; OSM layer bake)"


def overpass(query):
    body = urllib.parse.urlencode({"data": query}).encode()
    for _ in range(2):
        for url in OVERPASS:
            try:
                req = urllib.request.Request(url, data=body, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=240) as r:
                    return json.load(r)["elements"]
            except Exception as e:
                print("   overpass", url.split("/")[2], "failed:", e, flush=True)
                time.sleep(5)
    sys.exit("all Overpass mirrors failed")


def line_coords(geometry):
    return [[round(g["lon"], 6), round(g["lat"], 6)] for g in geometry]


def waterways():
    els = overpass(
        f"[out:json][timeout:180];"
        f'way["waterway"~"^(river|canal|stream)$"]({S},{W},{N},{E});'
        f"out geom tags;"
    )
    out = ROOT / "out"
    out.mkdir(exist_ok=True)
    gj = out / "dhaka-waterways.geojsonl"
    count = 0
    with gj.open("w") as fh:
        for el in els:
            if "geometry" not in el:
                continue
            t = el.get("tags", {})
            props = {
                "kind": t.get("waterway"),
                "name": t.get("name", ""),
                "name_bn": t.get("name:bn", ""),
            }
            fh.write(
                json.dumps(
                    {
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": line_coords(el["geometry"])},
                        "properties": props,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            count += 1
    pm = out / "dhaka-waterways.pmtiles"
    subprocess.run(
        [
            "tippecanoe",
            "-o",
            str(pm),
            "--force",
            "--layer=waterways",
            "--minimum-zoom=9",
            "--maximum-zoom=15",
            "--drop-densest-as-needed",
            "--attribution=© OpenStreetMap contributors",
            str(gj),
        ],
        check=True,
    )
    print(f"waterways: {count} ways → {pm} ({pm.stat().st_size // 1000} kB)")


def rail():
    els = overpass(
        f"[out:json][timeout:180];("
        f'way["railway"~"^(subway|rail|light_rail)$"]["service"!~"^(yard|siding|spur)$"]({S},{W},{N},{E});'
        f'node["railway"="station"]({S},{W},{N},{E});'
        f");out geom tags;"
    )
    features = []
    for el in els:
        t = el.get("tags", {})
        if el["type"] == "way" and "geometry" in el:
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": line_coords(el["geometry"])},
                    "properties": {
                        "mode": t.get("railway", "rail"),
                        "name": t.get("name") or t.get("operator") or "",
                        "name_bn": t.get("name:bn", ""),
                        "osm": f"way/{el['id']}",
                    },
                }
            )
        elif el["type"] == "node" and "lat" in el:
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [round(el["lon"], 6), round(el["lat"], 6)]},
                    "properties": {
                        "kind": "station",
                        "mode": t.get("station") or t.get("subway") or "rail",
                        "name": t.get("name") or t.get("name:en") or "",
                        "name_bn": t.get("name:bn", ""),
                        "osm": f"node/{el['id']}",
                    },
                }
            )
    doc = {
        "type": "FeatureCollection",
        "name": "dhaka-rail-osm",
        "description": "MRT and Bangladesh Railway tracks and stations from OpenStreetMap (ODbL). As mapped.",
        "features": features,
    }
    dst = ROOT / "public" / "data" / "dhaka-rail-osm.geojson"
    dst.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
    print(f"rail: {len(features)} features → {dst} ({dst.stat().st_size // 1000} kB)")


if __name__ == "__main__":
    {"rail": rail, "waterways": waterways}[sys.argv[1]]()
