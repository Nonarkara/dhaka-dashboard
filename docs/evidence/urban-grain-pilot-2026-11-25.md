---
updated: 2026-11-25
drafted_by: codex/gpt-6.2-sol
reviewed: false
---

# Dhaka street and Parliament pilot

Pilot implementation and evidence.

## Matched scene inputs

Use the published baseline build dhaka-atlas-20261125-1795597188-b41633e and the local pilot with the same viewport, language and area. Fixture URL suffixes select the existing authored cameras. Append `&basemap=fabric` to compare the pilot's new basemap at the same view. Use the Map view selector to compare 2D and 3D.

| Scene | URL query | Authored centre longitude, latitude | Zoom / pitch / bearing | Transportation / water in centre tile |
|---|---|---|---|---|
| Old Dhaka | `?lang=en&area=old-dhaka` | 90.4072, 23.7118 | 15.5 / 45° / 15° | 262 / 16 |
| Motijheel | `?lang=en&area=motijheel` | 90.4172, 23.733 | 15.8 / 55° / −20° | 306 / 37 |
| Tejgaon | `?lang=en&area=tejgaon` | 90.4075, 23.7703 | 16.5 / 55° / −25° | 161 / 17 |
| Parliament | `?lang=en&area=parliament` | 90.3786, 23.76245 | 16.7 / 55° / −20° | 217 / 20 |

Parliament zoom increases with viewport width under the existing camera rule. Counts come from decoded OpenFreeMap zoom 14 centre tiles reviewed by a separate agent. They count tile feature fragments, not buildings, whole streets or districts. Both source layers are in the same attributed vector tiles already used for building footprints. Ordinary opening map style and sources remain available. The pilot uses the existing tile endpoint, renderer and dependency set. Local gzip of the changed eager HTML, app script, stylesheet and translation dictionary totals 58,038 bytes versus 55,731 at baseline, an increase of 2,307 bytes. This is a file compression check. Browser transfer size and time to interaction remain unmeasured.

## Source findings

| Lead | Evidence | Disposition |
|---|---|---|
| Tropical TA Tower, Malibagh | [Tropical Homes project page](https://www.tropicalhomesltd.com/projects/ta-tower) lists G+44 at 468 DIT Road. | Credible 45-storey lead. No matched as-built polygon or verified metre height from the cited source. |
| Dhaka Tower, Tejgaon | [OMA](https://www.oma.com/projects/dhaka-tower) gives a 150 m design and construction status. | Keep design height and status in the review register. No verified completed footprint match. |
| City Centre, Motijheel | [Skyscraper Center](https://www.skyscrapercenter.com/building/city-centre/10181) lists 171 m to architectural top. The existing [OSM object](https://www.openstreetmap.org/way/686702285) is captured at 118 m. | Inspect vertical reference, source geometry and roof/spire convention before changing extrusion. Existing source height retained. |
| Pinnacle, Tejgaon | Existing footprint match and [project manager record](https://ascentis.build/project/pinnacle-raising-the-standard-for-high-rise-construction-in-bangladesh/) at 152.3 m. [Developer](https://shantaholdings.com/projects/pinnacle) reports 40 storeys. | Existing extrusion and discrepancy retained. |
| National Assembly exterior | [Public Sketchfab embed](https://sketchfab.com/models/4d1a857061b646ef8c9fea2124b1f504) identified. Listing fetch returns HTTP 403 and did not establish download or adaptation rights. | Continue with the original schematic and sourced campus. Detailed model remains conditional. |

No verified 50-storey as-built footprint was found in this bounded pass. Current published inventories remain 276 CBD source-height footprints and 4,076 Parliament footprints with 14 courtyard rings. The late-arriving detail test continues to prove the streamed fallback and the mutually exclusive local/streamed transition. The new keyboard inspection test opens the Parliament footprint, shows the eight source-reported storeys alongside unknown metre height, links its source, and restores focus on Escape.

## Release gate

The browser recovered after initial timeouts. Settled pixels cover 390, 1024 and 1440 px, in English and Bengali, with doubled semantic type on phones. The in-app browser supplies these captures. An independent reviewer cleared the three city scenes and the final English and Bengali campus captures, including the enlarged phone. The KL opening view is included as a visual reference at the same 1440×900 viewport. Its taller, denser skyline, KLCC landmark contrast and transport corridors establish the comparison. Its default camera, palette, provider-computed heights and scale differ, so this is a composition reference. A physical Android, controlled cold/warm timing comparison, pinned Overture comparison and resident testing remain open. Fixed scene links and the test protocol are recorded for reproduction.

The independent source review intersected the water tile with the Assembly outlines. Water covers the complete outer outline and all 14 courtyard rings in the sampled tile. The pilot reuses the exact existing interior rings as neutral openings only while fabric and local Parliament detail are active. The underlying water layer is kept as sourced. Source disclosure explains the generalization. On phones, the authored fabric campus view moves the main block above the enlarged watch strip.

Rendered evidence lives in the sibling directory of the same name. The matched desktop pilot scenes use a temporary app-owned probe of MapLibre's idle event. The campus captures wait for the Assembly relation in rendered features. A transparent layer primes local tiles, and streamed footprints remain until the local source can return actual features. Metadata readiness alone cannot switch ownership. Preview files are removed from production assets. Presentation differs between the satellite baseline and the fabric pilot by design.

The sampled Old Dhaka daytime-temperature history has a 25 November record with a recorded method and 96% coverage. Its 24 November predecessor has complete coverage and no recorded method. This pair cannot satisfy the existing comparison contract. No data values or provenance fields were added to history to make it compare.

## Live release

The canonical runner accepted build `dhaka-atlas-20261125-1795616225-65e9678` on Worker `d4f6f183-c4b2-42b4-af29-1532c14df3fa`. The receipt records every required stage as passed, with 97 of 98 satellite readings and no fully quiet instrument. Exact live assets, 13 API checks, four independently decoded image layers, snapshot, population and planning checks passed. The build ID agrees with the custom domain. Actual browser smoke opened the Bengali Parliament view and checked its source qualification, then switched Old Dhaka to 2D with the Street fabric basemap. See the live screenshots and receipt alongside this file.
