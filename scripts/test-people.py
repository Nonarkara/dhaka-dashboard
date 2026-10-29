import importlib.util
import unittest
import tempfile
import argparse
import contextlib
import io
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('people', Path(__file__).with_name('refresh-people.py'))
people = importlib.util.module_from_spec(spec)
spec.loader.exec_module(people)


class AggregationTests(unittest.TestCase):
    def test_unknown_is_not_zero(self):
        self.assertEqual(people.summarize([-99999, float('nan')], -99999), (None, 0, 2))
        self.assertEqual(people.summarize([0, -99999], -99999), (0.0, 1, 2))
        self.assertGreater(people.summarize([0.0004], -99999)[0], 0)
        self.assertEqual(people.summarize([1.25, 2.5, -99999], -99999), (3.75, 2, 3))

    def test_source_ids_and_exact_id_dedup(self):
        x, y = people.TO_METRIC.transform(90.4, 23.8)
        cell = f'{int(x//1000)}-{int(y//1000)}'
        node = {'id': 1, 'type': 'node', 'lon': 90.4, 'lat': 23.8, 'tags': {'amenity': 'school', 'phone': 'excluded'}}
        way = {'id': 1, 'type': 'way', 'center': {'lon': 90.4, 'lat': 23.8}, 'tags': {'healthcare': 'clinic'}}
        raw = {'osm3s': {'timestamp_osm_base': '2026-10-29T00:00:00Z'}, 'elements': [node, node, way]}
        rows = people.facility_rows(raw, {cell})
        self.assertEqual([f['properties']['osmId'] for f in rows], ['node/1', 'way/1'])
        self.assertEqual(rows[1]['geometry']['coordinates'], [90.4, 23.8])
        self.assertNotIn('phone', str(rows))
        self.assertEqual(people.facility_rows(raw, set()), [])
        with self.assertRaises(ValueError):
            people.facility_rows({**raw, 'remark': 'timeout'}, {cell})

    def test_pixel_centres_conserve_counts_in_metric_grid(self):
        import rasterio
        import numpy as np
        from rasterio.transform import from_origin
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            raster = folder/'test.tif'
            transform = from_origin(90.39, 23.82, .01, .01)
            values = np.array([[0, 3.5], [8.25, -99999]], dtype='float32')
            with rasterio.open(raster, 'w', driver='GTiff', height=2, width=2, count=1, dtype='float32', crs='EPSG:4326', transform=transform, nodata=-99999) as dst:
                dst.write(values, 1)
            (folder/'stac.json').write_text(json.dumps({'id': 'bgd_pop_2025_CN_100m_R2025A_v1', 'links': [{'rel': 'self', 'href': 'https://example.test/item'}], 'assets': {'data': {'href': 'https://example.test/raster'}}}))
            (folder/'osm.json').write_text(json.dumps({'osm3s': {'timestamp_osm_base': '2026-10-29T00:00:00Z'}, 'elements': []}))
            (folder/'query.txt').write_text('fixture')
            with contextlib.redirect_stdout(io.StringIO()):
                people.rebuild(argparse.Namespace(raster=str(raster), stac=str(folder/'stac.json'), osm=str(folder/'osm.json'), query=str(folder/'query.txt'), osm_endpoint='https://example.test/osm', output=str(folder/'out')))
            cells = json.loads((folder/'out/people-grid.json').read_text())['cells']
            self.assertAlmostEqual(sum(c[2] or 0 for c in cells), 11.75)
            self.assertEqual(sum(c[3] for c in cells), 3)
            self.assertEqual(sum(c[4] for c in cells), 4)
            self.assertTrue(any(c[2] is None for c in cells))
            expected = {}
            for rr, cc, value in ((0,0,0), (0,1,3.5), (1,0,8.25)):
                lon, lat = rasterio.transform.xy(transform, rr, cc, offset='center')
                xx, yy = people.TO_METRIC.transform(lon, lat)
                key = f'{int(xx//1000)}-{int(yy//1000)}'
                expected[key] = expected.get(key, 0) + value
            self.assertEqual({c[0]: c[2] for c in cells if c[2] is not None}, expected)
            for row in cells:
                for lon, lat in row[1]:
                    self.assertTrue(90 < lon < 91 and 23 < lat < 24)
                x, y = people.TO_METRIC.transform(*row[1][0])
                east, north = map(int, row[0].split('-'))
                self.assertLess(abs(x-east*1000), 1)
                self.assertLess(abs(y-north*1000), 1)


if __name__ == '__main__':
    unittest.main()
