#!/usr/bin/env python3
"""Rebuild dated reference layers. Requires rasterio, numpy and pyproj.

Inputs are complete downloaded WorldPop TIFF, STAC item and Overpass JSON.
No network access, interpolation, capacity estimates or nodata substitution.
"""
import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds, Window
from pyproj import Transformer

BBOX = [90.25, 23.60, 90.55, 23.95]
QUERY_BBOX = [90.23, 23.58, 90.57, 23.97]
TO_METRIC = Transformer.from_crs(4326, 32646, always_xy=True)
TO_GEO = Transformer.from_crs(32646, 4326, always_xy=True)


def summarize(values, nodata):
    """Keep valid zero; no valid pixels means unknown, never zero."""
    values = np.asarray(values)
    valid = np.isfinite(values) & (values != nodata) & (values >= 0)
    return (float(values[valid].sum(dtype=np.float64)) if valid.any() else None,
            int(valid.sum()), int(values.size))


def facility_rows(raw, allowed_cells):
    if raw.get('remark') or not raw.get('osm3s', {}).get('timestamp_osm_base'):
        raise ValueError('Incomplete or undated Overpass response')
    found = {}
    for el in raw['elements']:
        tags = el.get('tags', {})
        kind = tags.get('amenity')
        if kind not in ('school', 'hospital', 'clinic'):
            kind = tags.get('healthcare')
        if kind not in ('school', 'hospital', 'clinic'):
            continue
        pos = el if el['type'] == 'node' else el.get('center', {})
        lon, lat = pos.get('lon'), pos.get('lat')
        if lon is None or lat is None:
            raise ValueError('Missing object position')
        x, y = TO_METRIC.transform(lon, lat)
        cell = f'{math.floor(x / 1000)}-{math.floor(y / 1000)}'
        if cell not in allowed_cells:
            continue
        oid = f"{el['type']}/{el['id']}"
        found[oid] = {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(lon, 5), round(lat, 5)]},
                      'properties': {'osmId': oid, 'kind': kind, 'cell': cell,
                                     **({'name': tags['name']} if tags.get('name') else {}),
                                     **({'name_bn': tags['name:bn']} if tags.get('name:bn') else {})}}
    return sorted(found.values(), key=lambda f: f['properties']['osmId'])


def rebuild(args):
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    item = json.loads(Path(args.stac).read_text())
    if item['id'] != 'bgd_pop_2025_CN_100m_R2025A_v1':
        raise ValueError('Unexpected WorldPop release')
    xs, ys = TO_METRIC.transform([BBOX[0], BBOX[2], BBOX[0], BBOX[2]], [BBOX[1], BBOX[1], BBOX[3], BBOX[3]])
    xmin, xmax = math.floor(min(xs)/1000), math.ceil(max(xs)/1000)
    ymin, ymax = math.floor(min(ys)/1000), math.ceil(max(ys)/1000)
    corners = [TO_GEO.transform(x*1000, y*1000) for x in (xmin, xmax) for y in (ymin, ymax)]
    west, east = min(p[0] for p in corners), max(p[0] for p in corners)
    south, north = min(p[1] for p in corners), max(p[1] for p in corners)
    if not (QUERY_BBOX[0] <= west < east <= QUERY_BBOX[2] and QUERY_BBOX[1] <= south < north <= QUERY_BBOX[3]):
        raise ValueError('OSM query does not cover the grid')
    with rasterio.open(args.raster) as src:
        if src.crs.to_epsg() != 4326 or src.nodata != -99999:
            raise ValueError('Unexpected raster CRS or nodata')
        win = from_bounds(west, south, east, north, src.transform)
        c0, r0 = math.floor(win.col_off)-1, math.floor(win.row_off)-1
        c1, r1 = math.ceil(win.col_off+win.width)+1, math.ceil(win.row_off+win.height)+1
        win = Window(c0, r0, c1-c0, r1-r0).intersection(Window(0, 0, src.width, src.height))
        c0, r0 = win.col_off, win.row_off
        data = src.read(1, window=win)
        rr, cc = np.indices(data.shape)
        lon = src.transform.c + (cc+c0+0.5)*src.transform.a
        lat = src.transform.f + (rr+r0+0.5)*src.transform.e
        eastings, northings = TO_METRIC.transform(lon, lat)
        gx, gy = np.floor(eastings/1000).astype(int), np.floor(northings/1000).astype(int)
        rows = []
        for y in range(ymin, ymax):
            for x in range(xmin, xmax):
                pop, valid, total = summarize(data[(gx == x) & (gy == y)], src.nodata)
                ring = [[round(a, 5), round(b, 5)] for a, b in [TO_GEO.transform(xx*1000, yy*1000) for xx, yy in ((x,y),(x+1,y),(x+1,y+1),(x,y+1))]]
                rows.append([f'{x}-{y}', ring, pop, valid, total, 0, 0, 0])
    lookup = {row[0]: row for row in rows}
    raw = json.loads(Path(args.osm).read_text())
    facilities = facility_rows(raw, lookup)
    for feature in facilities:
        p = feature['properties']
        lookup[p['cell']][{'school': 5, 'hospital': 6, 'clinic': 7}[p['kind']]] += 1
    assets = {'people-grid.json': {'columns': ['id', 'ring', 'population', 'validPixels', 'totalPixels', 'schoolObjects', 'hospitalObjects', 'clinicObjects'], 'cells': rows},
              'facilities.geojson': {'type': 'FeatureCollection', 'features': facilities}}
    hashes = {}
    for name, payload in assets.items():
        body = json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()
        if len(body) > 500_000:
            raise ValueError(f'{name} exceeds 500KB: {len(body)}')
        (out/name).write_bytes(body)
        hashes[name] = {'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body), 'url': f'/data/{name}'}
    manifest = {'status': 'reference', 'generatedAt': datetime.now(timezone.utc).isoformat(), 'bbox': [west, south, east, north],
                'grid': {'crs': 'EPSG:32646', 'cellSizeM': 1000, 'coordinateDecimals': 5, 'fieldLicenses': {'population': 'CC BY 4.0 (WorldPop)', 'OSMCountColumns': 'ODbL 1.0 (OpenStreetMap contributors)'}, 'method': 'sum of native pixel counts assigned by pixel centre; no interpolation', 'cells': len(rows)},
                'population': {'year': 2025, 'release': item['id'], 'source': next(link['href'] for link in item['links'] if link['rel'] == 'self'), 'asset': item['assets']['data']['href'], 'doi': '10.5258/SOTON/WP00839', 'license': 'CC BY 4.0', 'citation': 'Bondarenko M. et al. (2025). WorldPop Global Demographic Data R2025A v1. DOI:10.5258/SOTON/WP00839', 'tier': 'modeled', 'nativeResolution': '3 arcseconds; approximately 100m at equator', 'unit': 'estimated people per valid pixel', 'sha256': hashlib.sha256(Path(args.raster).read_bytes()).hexdigest(), 'limits': 'Model estimate for 2025, not census or current residents. Nodata remains unknown; valid-pixel share is not accuracy or confidence. No uncertainty interval supplied.'},
                'facilities': {'source': args.osm_endpoint, 'extract': raw.get('extract'), 'observedAt': raw['osm3s']['timestamp_osm_base'], 'license': 'ODbL 1.0', 'attribution': '© OpenStreetMap contributors', 'selection': raw.get('extract', {}).get('method') or Path(args.query).read_text(), 'sha256': hashlib.sha256(Path(args.osm).read_bytes()).hexdigest(), 'objects': len(facilities), 'limits': 'Mapped school, hospital and clinic objects only. Campus objects may duplicate institutions. Incomplete mapping; no capacity, opening status or service catchments. Ways and relations use bounding-box centres.'}, 'assets': hashes}
    (out/'people-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'cells': len(rows), 'mappedObjects': len(facilities), 'assets': hashes}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('raster', 'stac', 'osm', 'query', 'osm-endpoint'):
        parser.add_argument('--'+name, required=True)
    parser.add_argument('--output', default='public/data')
    rebuild(parser.parse_args())
