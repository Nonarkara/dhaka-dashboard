#!/usr/bin/env python3
"""Bake explicit source heights on actual OSM footprints, never levels-to-metres.

Reproduce from privacy-filtered, dated OSM map captures:
  python3 scripts/bake-city-heights.py
Or pass replacement .osm captures explicitly (geometry must remain complete).
"""
import datetime
import hashlib
import json
import math
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
paths = [Path(p) for p in sys.argv[1:]] or sorted((ROOT / 'scripts/fixtures/city-heights').glob('*.osm'))
if not paths:
    raise SystemExit('No input captures')
objects = {}
inputs = []
for path in paths:
    tree = ET.parse(path).getroot()
    bounds = tree.find('bounds')
    if bounds is None:
        raise ValueError('Capture lacks source bounds: ' + str(path))
    bbox = [float(bounds.attrib[k]) for k in ('minlon', 'minlat', 'maxlon', 'maxlat')]
    capture = tree.find('meta')
    captured = capture.attrib if capture is not None else {}
    inputs.append({
        'file': path.name,
        'bbox': bbox,
        'source_url': captured.get('source_url', 'https://api.openstreetmap.org/api/0.6/map?bbox=' + ','.join(map(str, bbox))),
        'retrieved_at': captured.get('retrieved_at', datetime.datetime.fromtimestamp(path.stat().st_mtime, datetime.timezone.utc).isoformat()),
        'input_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'original_response_sha256': captured.get('source_sha256'),
        'source_building_objects': int(captured['building_objects']) if 'building_objects' in captured else None,
        'source_height_objects': int(captured['height_objects']) if 'height_objects' in captured else None,
    })
    for element in tree:
        if element.tag not in ('node', 'way', 'relation'):
            continue
        key = (element.tag, element.attrib['id'])
        previous = objects.get(key)
        if previous is None or int(element.attrib.get('version', '0')) > int(previous.attrib.get('version', '0')):
            objects[key] = element
nodes = {}
for (kind, ident), element in objects.items():
    if kind == 'node':
        point = [float(element.attrib['lon']), float(element.attrib['lat'])]
        if not all(math.isfinite(v) for v in point) or not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90):
            raise ValueError('Invalid source coordinate ' + ident)
        nodes[ident] = point
ways = {ident: e for (kind, ident), e in objects.items() if kind == 'way'}
def tags(e):
    return {t.attrib['k']: t.attrib['v'] for t in e.findall('tag')}
def metres(value):
    try:
        text = str(value).strip()
        if text.endswith(' m'):
            text = text[:-2].strip()
        value = float(text)
        return value if math.isfinite(value) and 0 <= value <= 500 else None
    except (TypeError, ValueError):
        return None
def refs(way):
    return [n.attrib['ref'] for n in way.findall('nd')]
def coordinates(ring):
    if len(ring) < 4 or ring[0] != ring[-1] or len(set(ring[:-1])) < 3:
        raise ValueError('unclosed-or-degenerate-ring')
    if any(n not in nodes for n in ring):
        raise ValueError('missing-source-node')
    return [nodes[n] for n in ring]
def join_rings(member_ids):
    if any(ident not in ways for ident in member_ids):
        raise ValueError('incomplete-relation-members')
    remaining = [refs(ways[ident]) for ident in member_ids]
    rings = []
    while remaining:
        ring = remaining.pop(0)
        if not ring:
            raise ValueError('empty-source-way')
        while ring[-1] != ring[0]:
            for i, tail in enumerate(remaining):
                if tail and tail[0] == ring[-1]:
                    break
                if tail and tail[-1] == ring[-1]:
                    tail = list(reversed(tail))
                    break
            else:
                raise ValueError('incomplete-relation-ring')
            ring += tail[1:]
            remaining.pop(i)
        rings.append(coordinates(ring))
    return rings
def contains(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside

features = []
consumed = set()
omissions = []
def build_feature(kind, element, t, geometry):
    ident = kind + '/' + element.attrib['id']
    height = metres(t.get('height'))
    base = metres(t.get('min_height', '0'))
    if height is None or base is None or height <= 0 or height <= base:
        raise ValueError('missing-invalid-or-nonpositive-height')
    if not element.attrib.get('timestamp'):
        raise ValueError('missing-source-timestamp')
    props = {
        'osm_id': ident,
        'name': t.get('name:en', t.get('name', 'Mapped building')),
        'name_bn': t.get('name:bn', t.get('name', '')),
        'building': t.get('building', t.get('building:part', 'yes')),
        'height_m': height,
        'min_height_m': base,
        'height_method': 'osm-height-tag',
        'height_tier': 'reference',
        'height_source_url': 'https://www.openstreetmap.org/' + ident,
        'source_url': 'https://www.openstreetmap.org/' + ident,
        'osm_modified_at': element.attrib['timestamp'],
        'osm_height_tag': t['height'],
        'osm_min_height_tag': t.get('min_height'),
        'provenance': 'reference',
    }
    for key in ('amenity', 'office', 'shop', 'building:use'):
        if key in t:
            props[key] = t[key]
    if 'building:levels' in t:
        props['osm_levels_tag'] = t['building:levels']
    if ident == 'relation/12770867':
        # Exact named geometry/address match, not a nearby point or inferred box.
        expected = {'name': 'Shanta Pinnacle', 'addr:housenumber': '190', 'addr:street': 'Bir Uttam Mir Shawkat Sarak', 'building:levels': '40'}
        if any(t.get(key) != value for key, value in expected.items()):
            raise ValueError('pinnacle-source-identity-mismatch')
        props.update({
            'height_m': 152.3,
            'height_method': 'published-project-height',
            'height_source_name': 'Ascentis, project manager',
            'height_source_url': 'https://ascentis.build/project/pinnacle-raising-the-standard-for-high-rise-construction-in-bangladesh/',
            'height_source_checked_at': '2026-11-23',
            'height_conflict': 'OSM height tag is 120 m; project manager publishes 152.3 m. Published project height is used; this is not an independent survey.',
            'osm_height_m': height,
            'floors': 40,
            'floors_source_url': 'https://shantaholdings.com/projects/pinnacle',
            'completion_status': 'completed',
            'completion_source_url': 'https://shantaholdings.com/projects/pinnacle',
            'source_address': '190, Bir Uttam Mir Shawkat Sarak, Tejgaon',
        })
    features.append({'type': 'Feature', 'id': ident, 'properties': props, 'geometry': geometry})

for (kind, ident), e in sorted(objects.items(), key=lambda item: (item[0][0], int(item[0][1]))):
    if kind != 'relation':
        continue
    t = tags(e)
    if not ('building' in t or 'building:part' in t) or 'height' not in t:
        continue
    try:
        if t.get('type') != 'multipolygon':
            raise ValueError('unsupported-building-relation')
        members = [m.attrib for m in e.findall('member')]
        if any(m['type'] != 'way' or m.get('role', '') not in ('outer', 'inner', '') for m in members):
            raise ValueError('unsupported-relation-member')
        outers = join_rings([m['ref'] for m in members if m.get('role', '') in ('outer', '')])
        inners = join_rings([m['ref'] for m in members if m.get('role') == 'inner'])
        if not outers:
            raise ValueError('missing-outer-ring')
        polygons = [[ring] for ring in outers]
        for ring in inners:
            parents = [p for p in polygons if contains(ring[0], p[0])]
            if len(parents) != 1:
                raise ValueError('unassigned-or-ambiguous-courtyard')
            parents[0].append(ring)
        build_feature(kind, e, t, {'type': 'MultiPolygon', 'coordinates': polygons})
        consumed.update(m['ref'] for m in members)
    except ValueError as error:
        omissions.append({'osm_id': kind + '/' + ident, 'reason': str(error)})
for ident, e in sorted(ways.items(), key=lambda item: int(item[0])):
    t = tags(e)
    if ident in consumed or not ('building' in t or 'building:part' in t) or 'height' not in t:
        continue
    try:
        build_feature('way', e, t, {'type': 'Polygon', 'coordinates': [coordinates(refs(e))]})
    except ValueError as error:
        omissions.append({'osm_id': 'way/' + ident, 'reason': str(error)})
if not features or not any(f['id'] == 'relation/12770867' for f in features):
    raise ValueError('Required audited Pinnacle source geometry missing')
result = {
    'type': 'FeatureCollection',
    'bbox': [min(i['bbox'][0] for i in inputs), min(i['bbox'][1] for i in inputs), max(i['bbox'][2] for i in inputs), max(i['bbox'][3] for i in inputs)],
    'metadata': {
        'source': 'OpenStreetMap contributors; published Pinnacle project height from Ascentis',
        'license': 'OpenStreetMap geometry and tags: ODbL-1.0; published height is an attributed factual value, no third-party model or imagery copied.',
        'inputs': inputs,
        'retrieved_at': max(i['retrieved_at'] for i in inputs),
        'feature_count': len(features),
        'omissions': omissions,
        'omitted_feature_count': len(omissions),
        'consumed_relation_member_way_count': len(consumed),
        'height_note': 'Only explicit OSM metre heights or the individually attributed published project height are used. No floor-to-metre conversion, provider render_height, generic fallback or surveyed-height claim.',
        'geometry_note': 'Actual source footprints, closed ways and complete multipolygons; courtyards retained. Uniform-height footprint prisms are not architectural models or roof profiles.',
        'coverage_note': 'Selected height-tagged source buildings in three dated map captures near Motijheel, Tejgaon and Gulshan. Not a complete inventory or citywide coverage; combined bbox is an envelope, not continuous captured coverage. Absence is not evidence that a building or high-rise does not exist.',
        'privacy_note': 'Input captures retain only required geometry, IDs, timestamps, building tags and the published Pinnacle street address. Contributor identifiers and contact tags are excluded.',
    },
    'features': features,
}
output = ROOT / 'public/data/city-height-buildings.geojson'
output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(str(output) + ': ' + str(len(features)) + ' explicit-height building footprints; ' + str(len(omissions)) + ' omissions')
