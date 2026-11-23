# Skyline audit · 23 November 2026

## Findings and repair

Default City in 3D opened at zoom 13, below its building minzoom 14. The sole detailed local snapshot covered Parliament and could not represent business districts. Later changes had restored provider-computed/default heights without original tag provenance. Walk could extrude in 2D and ignored initial area links. Tests now exercise these failures.

The opening view frames the Tejgaon tower cluster at zoom 16.5. New city-height GeoJSON contains 276 traceable source-height footprints in three captured OSM bboxes. Native footprints remain, unknown stays flat, Parliament’s 4,076 footprints and courtyard rings remain. No floor-to-metre fallback is used. OSM tags are community reference data, not surveyed facts. Many tags may themselves be estimates; the map does not assert independent validation.

Pinnacle’s actual OSM multipolygon/address/name match the developer’s project. Its height uses the project manager’s published 152.3 m and preserves the OSM 120 m conflict. Developer reports 40 storeys/completed status. The CVU database’s 176 m is explicitly a floor-count estimate, so it was not treated as a surveyed replacement. No completed 50-storey claim was established.

Sources checked 23 November 2026:
- https://shantaholdings.com/projects/pinnacle — 40 storeys, completed, address 190 Bir Uttam Mir Shawkat Sarak.
- https://ascentis.build/project/pinnacle-raising-the-standard-for-high-rise-construction-in-bangladesh/ — project manager’s published height; source prose has mixed scheduled/completed wording, not a current occupancy certificate.
- https://www.skyscrapercenter.com/building/pinnacle/36736 — 176 m explicitly estimated from floor count.
- OSM per-feature links, original modification times, captured source URLs/bounds/hashes, exclusions and licence are embedded in data metadata. Input captures omit contributor/contact data.

## Verification and limits

Behavior tests cover actual layer paint, source tower values/conflict, missing source staying flat, 2D visibility, visible opening zoom, and initial walk-area intent versus delayed data/manual navigation/language refresh. Original default zoom fails the opening-camera assertion. Data regeneration, courtyard/member handling and incomplete-relation refusal were independently checked.

Actual local screenshots: 390 EN/BN, 1024 EN, settled 1440 EN; source inspection; enlarged Bengali and walk Tejgaon link. Settled desktop DOM: viewport 1440×900, header 41 px, map/canvas 1440×859, watch 23.5 px. Earlier resize-in-flight screenshot was replaced. A separate reviewer passed source and normal-size composition. Enlarged text is complete/readable, but the inherited watch strip obscures much of the map: this is not an all-size MSH clearance.

Coverage is partial: the Gulshan capture has only two tagged heights; most surrounding unknown footprints remain flat. Uniform-height prisms do not reproduce slanted roofs, podiums or facades. No street-access, evacuation or safety inference was added. Release status is recorded separately in release.txt; local screenshots alone do not prove production delivery.
