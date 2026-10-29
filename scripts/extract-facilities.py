#!/usr/bin/env python3
"""Derive bounded OSM objects from a dated Geofabrik PBF; requires osmium CLI.

Only IDs, names, categories and positions survive in the public derivative.
Ways/relations use the centre of all referenced geometry's bounding box.
"""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
import xml.etree.ElementTree as ET


def extract(pbf, output, source):
    timestamp = subprocess.check_output(['osmium', 'fileinfo', '-g', 'header.option.osmosis_replication_timestamp', pbf], text=True).strip()
    if not timestamp:
        raise ValueError('Missing extract observation date')
    with tempfile.TemporaryDirectory() as directory:
        filtered, xml = str(Path(directory)/'facilities.osm.pbf'), str(Path(directory)/'facilities.osm')
        subprocess.run(['osmium', 'tags-filter', pbf, 'nwr/amenity=school,hospital,clinic', 'nwr/healthcare=hospital,clinic', '-t', '-o', filtered], check=True)
        subprocess.run(['osmium', 'cat', filtered, '-f', 'osm', '-o', xml], check=True)
        objects, matches = {}, []
        for event, el in ET.iterparse(xml, events=['end']):
            if el.tag not in ('node', 'way', 'relation'):
                continue
            key = (el.tag, int(el.attrib['id']))
            tags = {t.attrib['k']: t.attrib['v'] for t in el.findall('tag')}
            if el.tag == 'node':
                geometry = (float(el.attrib['lon']), float(el.attrib['lat']))
            elif el.tag == 'way':
                geometry = [('node', int(n.attrib['ref'])) for n in el.findall('nd')]
            else:
                geometry = [(m.attrib['type'], int(m.attrib['ref'])) for m in el.findall('member')]
            objects[key] = geometry
            if tags.get('amenity') in ('school', 'hospital', 'clinic') or tags.get('healthcare') in ('hospital', 'clinic'):
                matches.append((key, tags))
            el.clear()

        def bounds(key, visited):
            if key in visited:
                raise ValueError('Cyclic facility relation')
            shape = objects.get(key)
            if shape is None or not shape:
                raise ValueError(f'Missing referenced geometry for {key}')
            if key[0] == 'node':
                return (*shape, *shape)
            boxes = [bounds(ref, visited | {key}) for ref in shape]
            return min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)

        elements = []
        for key, tags in matches:
            west, south, east, north = bounds(key, set())
            lon, lat = (west+east)/2, (south+north)/2
            if not (90.23 <= lon <= 90.57 and 23.58 <= lat <= 23.97):
                continue
            el = {'type': key[0], 'id': key[1], 'tags': {k: v for k, v in tags.items() if k in ('amenity', 'healthcare', 'name', 'name:bn')}}
            el.update({'lon': lon, 'lat': lat} if key[0] == 'node' else {'center': {'lon': lon, 'lat': lat}})
            elements.append(el)
        result = {'osm3s': {'timestamp_osm_base': timestamp}, 'extract': {'source': source, 'sha256': hashlib.sha256(Path(pbf).read_bytes()).hexdigest(), 'method': 'osmium tags-filter nwr/amenity=school,hospital,clinic nwr/healthcare=hospital,clinic; complete referenced geometry; bbox-centres retained inside 90.23,23.58,90.57,23.97'}, 'elements': elements}
        Path(output).write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
        print(f'Extracted {len(elements)} mapped objects · {timestamp}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pbf', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--source', required=True)
    args = parser.parse_args()
    extract(args.pbf, args.output, args.source)
