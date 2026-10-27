#!/usr/bin/env python3
"""Bake real OSM ways/multipolygons, preserving courtyards. No generated footprints.
Usage: python3 scripts/bake-parliament-buildings.py /path/to/api-map.osm
Source: https://api.openstreetmap.org/api/0.6/map?bbox=90.369,23.752,90.388,23.773
Only public building geometry/tags are kept; contributor/contact data is omitted.
"""
import sys, json, math, datetime, hashlib
import xml.etree.ElementTree as ET
from pathlib import Path
root = ET.parse(sys.argv[1]).getroot()
seen={(e.tag,e.attrib.get('id')) for e in root}
for path in sys.argv[2:]:
    for e in ET.parse(path).getroot():
        key=(e.tag,e.attrib.get('id'))
        if key not in seen: root.append(e); seen.add(key)
bounds = root.find('bounds').attrib
bbox = [float(bounds[k]) for k in ['minlon','minlat','maxlon','maxlat']]
nodes = {e.attrib['id']: [float(e.attrib['lon']),float(e.attrib['lat'])] for e in root.findall('node')}
ways = {e.attrib['id']: e for e in root.findall('way')}
def tags(e): return {t.attrib['k']:t.attrib['v'] for t in e.findall('tag')}
def refs(w): return [n.attrib['ref'] for n in w.findall('nd')]
def coordinates(ring):
    if any(n not in nodes for n in ring): raise ValueError('Missing nodes')
    return [nodes[n] for n in ring]
def join_rings(parts):
    remaining = [refs(ways[i]) for i in parts]
    rings = []
    while remaining:
        ring = remaining.pop(0)
        while ring[-1] != ring[0]:
            for i, tail in enumerate(remaining):
                if tail[0] == ring[-1]: break
                if tail[-1] == ring[-1]: tail = list(reversed(tail)); break
            else: raise ValueError('Unclosed relation ring')
            ring += tail[1:]; remaining.pop(i)
        if len(ring) < 4: raise ValueError('Degenerate ring')
        rings.append(coordinates(ring))
    return rings
def contains(point, ring):
    x,y = point; result=False
    for a,b in zip(ring,ring[1:]):
        if (a[1]>y)!=(b[1]>y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]: result=not result
    return result
def number(value):
    try:
        result=float(str(value).removesuffix(' m').strip())
        return result if math.isfinite(result) and result >= 0 else None
    except (ValueError,TypeError): return None
features=[]; consumed=set()
def feature(kind, e, t, geometry):
    height=number(t.get('height')); levels=number(t.get('building:levels'))
    base=number(t.get('min_height')) or (number(t.get('building:min_level')) or 0)*3
    usable_height=height is not None and height>base
    method='osm-height-tag' if usable_height else 'levels-times-3m' if levels else 'unmapped-height-6m-estimate'
    height=height if usable_height else max((levels or 0)*3,base+6)
    props={
      'osm_id':kind+'/'+e.attrib['id'], 'name':t.get('name:en',t.get('name','Mapped building')),
      'name_bn':t.get('name:bn',t.get('name','')), 'building':t.get('building','yes'),
      'height_m':height,'min_height_m':base,'height_method':method,
      'height_tier':'reference' if method=='osm-height-tag' else 'modeled',
      'source_url':'https://www.openstreetmap.org/'+kind+'/'+e.attrib['id'],
      'osm_modified_at':e.attrib['timestamp'], 'provenance':'reference',
    }
    if levels is not None: props['levels']=levels
    features.append({'type':'Feature','id':props['osm_id'],'properties':props,'geometry':geometry})
for e in root.findall('relation'):
    t=tags(e)
    if 'building' not in t: continue
    members=[m.attrib for m in e.findall('member') if m.attrib['type']=='way']
    missing=[m['ref'] for m in members if m['ref'] not in ways]
    if missing: raise ValueError('Incomplete building relation '+e.attrib['id'])
    outer_ids=[m['ref'] for m in members if m.get('role') in ['outer','']]
    inner_ids=[m['ref'] for m in members if m.get('role')=='inner']
    if not outer_ids: raise ValueError('No outer ring')
    outers=join_rings(outer_ids); inners=join_rings(inner_ids)
    # Parent relation can carry its levels/height on an outer way.
    inherited=tags(ways[outer_ids[0]]); inherited.update(t)
    polys=[[ring] for ring in outers]
    for ring in inners:
        target=next((p for p in polys if contains(ring[0],p[0])),None)
        if target is None: raise ValueError('Unassigned courtyard')
        target.append(ring)
    feature('relation',e,inherited,{'type':'MultiPolygon','coordinates':polys})
    consumed.update(m['ref'] for m in members)
for ident,e in ways.items():
    t=tags(e)
    if ident in consumed or 'building' not in t: continue
    ring=refs(e)
    if not ring or ring[0]!=ring[-1]: raise ValueError('Unclosed building '+ident)
    feature('way',e,t,{'type':'Polygon','coordinates':[coordinates(ring)]})
if not any(f['id']=='relation/18085267' for f in features): raise ValueError('Parliament missing')
result={
  'type':'FeatureCollection','bbox':bbox,
  'metadata':{'source':'OpenStreetMap contributors','source_url':'https://api.openstreetmap.org/api/0.6/map?bbox='+','.join(map(str,bbox)),
    'input_sha256':{Path(p).name:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in sys.argv[1:]},
    'license':'ODbL-1.0','license_url':'https://www.openstreetmap.org/copyright',
    'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'height_note':'Mapped heights when tagged; otherwise OSM levels x 3 m or 6 m estimate. Not an architectural survey.',
    'geometry_note':'Actual mapped building footprints, including multipolygon courtyards. No generated replacement shapes.'},
  'features':features}
output=Path(__file__).resolve().parent.parent/'public/data/parliament-buildings.geojson'
output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
print(str(output)+': '+str(len(features))+' mapped buildings')
