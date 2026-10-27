# Parliament and persistent 3D blocks

The task is to retain mapped building blocks in every lens and make Louis Kahn's National Parliament complex legible at close range. No header, control or watch structure was changed. The existing geometry budget and old-CSS falsification in the parent verification directory still apply; the added source qualification stays beside the lens description.

## Geometry and provenance

- City coverage uses OpenFreeMap/OpenMapTiles building footprints. A height tag is used when positive; otherwise a clearly qualified 6m block estimate keeps a mapped footprint visible. The provider's `hide_3d` flag is respected. Unmapped buildings are not invented.
- The self-hosted Parliament-area detail snapshot contains **4,076 actual OSM building footprints**, sourced through the OSM map API for `[90.369,23.752,90.388,23.773]`. Public geometry and relevant building tags are retained; contributor/contact fields are omitted. ODbL attribution and retrieval time are embedded in the file.
- Parliament is OSM relation `18085267`, with two outer polygons and **14 inner courtyard rings**. Its tagged outer way `24448328` is consumed by the relation and cannot duplicate it. Nearby residences, plazas and other mapped buildings are retained.
- Heights use OSM height tags when usable, otherwise levels × 3m, otherwise a 6m estimate. Parliament's eight mapped levels produce an **estimated 24m mass**, not a surveyed height or a faithful roof/facade reconstruction. The source popup states the method and snapshot date.
- The city and local extrusion layers are mutually exclusive. The local layer becomes eligible only after its source loads, at zoom≥16, with the whole map ground viewport inside the detail bbox plus a roughly 50 m inward guard. Pan, low zoom, loading or detail failure keeps/restores streamed city coverage. Both are hidden in 2D. This avoids unsupported polygon `within` filters and the removal of batched vector buildings by ID.
- Raster lenses are inserted below the first extrusion layer; landmarks remain above the block layers. The Parliament jump honors its authored bearing/pitch and adjusts wide-screen zoom so the detail source covers the viewport. Quick jumps retain 2D when selected.

## Reproduce the snapshot

Download the public OSM map XML from `https://api.openstreetmap.org/api/0.6/map?bbox=90.369,23.752,90.388,23.773`. The map response references two building relations outside its original extent; download `/api/0.6/relation/9716353/full` and `/api/0.6/relation/10186588/full` from the same API so all member rings are present. Run:

```sh
python3 scripts/bake-parliament-buildings.py map.osm relation-9716353.osm relation-10186588.osm
```

The baker refuses incomplete relations, missing nodes, unclosed rings, unassigned courtyards or a missing Parliament. Input SHA-256 checksums are recorded in the output metadata. Building-part-only features are omitted because this is footprint massing; no procedural roof components are generated.

## Verification

`test-building-behavior.mjs` evaluates the actual application functions with a map stub. It asserts all 12 lenses retain buildings; raster ordering; source-ready gating; exclusive local/city visibility; outward-pan, low-zoom, offline and2D behavior; authored cameras and the wide Parliament adjustment; positive height fallback; closed rings, unique IDs, Parliament holes and duplicate-parent removal. These supplement real rendered checks, not replace them.

CUA browser checks locally exercised Parliament in City and Heritage, switched2D/3D, then zoomed out to confirm streamed coverage returns without overlapping block layers. Desktop 1440×900 activated the detail source; zooming out restored the city source. Phone and desktop screenshots were independently reviewed. PNGs from the geometry fixture are scaled to fit the available browser pane; JSON records actual iframe dimensions. The detailed heights and architectural interiors remain unsurveyed. No physical Android-device benchmark is claimed.

Rendered Parliament scene measurements (same bounds/60% map/attribution budget as parent gate):

| Viewport | Combined chrome | Working map | Gate |
|---|---:|---|---|
| 390×844 | 180.84px | 390×663.16px | pass |
| 1024×900 | 91.95px | 1024×808.05px | pass |
| 1280×720 | 91.95px | 1280×628.05px | pass |
| 1440×900 | 91.95px | 1440×808.05px | pass |

Bengali map labels use the OpenFreeMap Noto Sans Regular glyph set; the inspected Bengali Unicode block contains 92 glyphs, whereas the old demo font stack returned an empty 32-byte block. The rest of the interface typography is unchanged. Initial area deep links position immediately, avoiding a paused initial camera animation in hidden browser panes; explicit user quick jumps retain their authored animation.

Live verification at `https://dhaka.nonarkara.org/?area=parliament&lang=bn` confirmed the detail source, courtyard blocks and Bengali map label in Heritage. Clicking the main block exposed relation 18085267, the 24 m levels-derived estimate, snapshot date and model qualification. Canonical deployment passed all nine suites, type checks, dataset checks, seven API smoke checks and exact-byte verification including the self-hosted footprint snapshot. Live screenshot: `live-heritage-bn.png`.
