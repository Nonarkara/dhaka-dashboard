#!/usr/bin/env python3
"""Trace CTAN Universa's distributed specimen into an independent webfont.

Source: Christian Holm's GPL-2.0-or-later METAFONT implementation, v2.1.
Needs pypdf, fontTools[brotli], and potrace. No global font installation.
The PDF's embedded medium-upright specimen provides the author's glyphs;
unsupported OT1/control/accent positions deliberately use the UI fallback.
"""
import hashlib
import io
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from pypdf import PdfReader
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'public/fonts/universa'
archive = DEST / 'source.zip'
if hashlib.sha256(archive.read_bytes()).hexdigest() != '58fd9768b2cef12c00db5f368ea145c4a21fd7603c22629cb9b1f05f4731cd89':
    raise SystemExit('Universa source archive differs from the reviewed CTAN release')
reader = PdfReader(io.BytesIO(zipfile.ZipFile(archive).read('universa/universa.pdf')))
# Font chart Figure 2 explicitly identifies fulmr8: medium, upright.
font = reader.pages[17]['/Resources']['/Font']['/F73'].get_object()
matrix = float(font['/FontMatrix'][0]) * 1000
glyphs = font['/CharProcs'].get_object()
excluded = {34, 39, 60, 62, 92, 94, 95, 123, 124, 125, 126}
charstrings = {'.notdef': T2CharStringPen(500, None).getCharString()}
metrics = {'.notdef': (500, 0)}
cmap = {}
with tempfile.TemporaryDirectory(prefix='universa-') as folder:
    work = Path(folder)
    for code in range(32, 127):
        if code in excluded:
            continue
        name = '/a' + str(code)
        if name not in glyphs:
            continue
        stream = glyphs[name].get_object().get_data()
        header, bitmap = stream.split(b'ID ', 1)
        dimensions = re.search(rb'/W (\d+)\s+/H (\d+)', header)
        transform = re.search(rb'([-\d.]+) 0 0 ([-\d.]+) ([-\d.]+) ([-\d.]+) cm', header)
        advance = round(float(stream.split()[0]) * matrix)
        glyph_name = 'uni' + format(code, '04X')
        pen = T2CharStringPen(advance, None)
        # The specimen chart marks the space slot visibly; a web space is empty.
        if code != 32 and dimensions and transform:
            width, height = map(int, dimensions.groups())
            data = bitmap[:((width + 7) // 8) * height]
            pbm = work / 'glyph.pbm'
            svg = work / 'glyph.svg'
            pbm.write_bytes(f'P4\n{width} {height}\n'.encode() + data)
            subprocess.run(['potrace', str(pbm), '-s', '-o', str(svg), '--turdsize', '0'], check=True)
            sx, sy, tx, ty = map(float, transform.groups())
            # Potrace emits path units at 10x bitmap resolution, bottom-up.
            output = TransformPen(pen, (sx / width * matrix / 10, 0, 0,
                                       sy / height * matrix / 10, tx * matrix, ty * matrix))
            for path in ET.parse(svg).getroot().iter('{http://www.w3.org/2000/svg}path'):
                parse_path(path.attrib['d'], output)
        charstrings[glyph_name] = pen.getCharString()
        metrics[glyph_name] = (advance, 0)
        cmap[code] = glyph_name
fb = FontBuilder(1000, isTTF=False)
fb.setupGlyphOrder(list(charstrings))
fb.setupCharacterMap(cmap)
fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=1000, descent=-300)
fb.setupNameTable({'familyName': 'Universa Civic', 'styleName': 'Regular',
                  'uniqueFontIdentifier': 'UniversaCivic-CTAN2.1-20261014',
                  'fullName': 'Universa Civic Regular', 'psName': 'UniversaCivic-Regular',
                  'version': 'Version 1.0',
                  'copyright': 'Christian Holm 1998; web conversion 2026. GPL-2.0-or-later.',
                  'licenseDescription': 'GNU GPL version 2 or later; source and conversion distributed alongside font.'})
fb.setupOS2(sTypoAscender=1000, sTypoDescender=-300, usWinAscent=1100, usWinDescent=350)
fb.setupPost()
fb.setupCFF('UniversaCivic-Regular', {'FullName': 'Universa Civic Regular', 'FamilyName': 'Universa Civic', 'Weight': 'Regular'}, charstrings, {})
fb.font['head'].created = fb.font['head'].modified = 3874780800
fb.font.recalcTimestamp = False
output = DEST / 'universa-civic-v1.woff2'
fb.font.flavor = 'woff2'
fb.save(output)
check = TTFont(output)
if not all(ord(c) in check.getBestCmap() for c in 'Jakartaabcdefghijklmnopqrstuvwxyz0123456789'):
    raise SystemExit('Required dashboard glyphs missing from the converted font')
print(f'Universa Civic: {len(cmap)} glyphs, {output.stat().st_size} bytes; source sha256 {hashlib.sha256(archive.read_bytes()).hexdigest()}')
