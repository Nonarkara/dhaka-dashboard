---
updated: 2026-11-25
drafted_by: codex/gpt-6.2-sol
reviewed: false
---

# Dhaka block by block

Owner approved. Pilot implementation and verification status are recorded in [the pilot evidence](../evidence/urban-grain-pilot-2026-11-25.md).

A reader should be able to see how the fine streets and blocks of Old Dhaka differ from Motijheel's commercial towers and Tejgaon's industrial plots, then inspect one building and see exactly what supports its shape and height. Give Louis Kahn's Parliament its own architectural treatment, with the lake, courts and campus readable at map scale and a detailed exterior available on demand when the source supports it.

## Baseline and design direction

- Main and origin agree at `c858f32`. The canonical site reports build `dhaka-atlas-20261125-1795597188-b41633e`. The accepted release receipt recorded 83 of 98 satellite readings. The fresh 25 November snapshot collected at 22:46 KST returned 97 of 98, with AOD available at all 14 sampled places. Treat each as a dated observation.
- The map has 276 source-height CBD footprints from three capture areas. Parliament has 4,076 dated footprints, 14 courtyard rings and eight explicit heights, plus a separate schematic design reference. The earlier ten-building review established nine evidence gaps and retained City Centre from the existing capture.
- Parliament footprint detail loads on nearby viewport entry, an explicit Parliament area selection, or the heritage lens. Rendering switches to local detail only when the zoom and viewport fit its coverage. Audit the handoff at the extent edge and at wide screen sizes.
- KL is the benchmark for how quickly a reader sees a recognizable district and how well it holds up as they move from skyline to street. KL's code accepts provider-computed and fallback heights. Dhaka's protected geographic rule requires traceable metre heights, with unknown heights left flat. Keep Dhaka's Wada colours, typography, building-type legend, live civic instruments, and existing 2D/3D, deep-link, map and walk controls.
- Use the modular map-edge grid. The opening gaze lands on the city fabric, then the place or building evidence, then the next action. Any authored camera movement starts with a user choice, respects reduced motion and cedes control to manual input.

## Work in shipping order

| Priority | Deliverable | Exit condition |
|---|---|---|
| P0 | Matched Dhaka/KL baseline and source inventory | Four fixed Dhaka scenes, test protocol, coverage denominators, named evidence gaps |
| P1 | Urban grain pilot and reliable building selection | Existing sources deliver a readable view in Old Dhaka, Motijheel and Tejgaon, with an evidence-ready Gulshan/Banani pilot area |
| P1 | Parliament campus and optional exterior detail | Geographic campus improvements stand alone. A detailed exterior ships only through the rights, alignment and device gates |
| P2 | Better evidence and dated civic playback | Compatible observations can be compared, and real dated frames play with clear gaps and source labels |
| P2 | Performance, resilience and release proof | Repeatable device runs and failure cases pass before canonical deployment |

### 0. Capture a baseline and qualify source evidence

1. Record fixed cameras for Tejgaon, Motijheel, Old Dhaka/Sadarghat and Parliament in 2D and 3D. Capture KL at comparable scale and pitch for skyline silhouette, street legibility, label clutter and time to first useful interaction. Record browser/device, viewport, network profile, build ID, basemap and cache state. Look at street blocks as well as isolated landmarks.
2. Start with the existing OSM capture and survey what gaps the map actually shows. Evaluate one pinned Overture Buildings extract in the same small areas, offline. Compare geometry, explicit height availability, source lineage and licences. Use street and river context to spot duplicate, displaced and water-crossing footprints. Record mapped-footprint counts, number with valid heights and denominator per dated extract. Area bounds and source completeness travel with the result. [Overture Buildings guide](https://docs.overturemaps.org/guides/buildings/)
3. Review a bounded sample of named towers from the existing leads and local reports. Record aliases, construction status and its evidence date, published storeys, explicit height and its datum, corroborating record, stable feature ID and rights. Match the footprint before importing geometry. Review all named towers and ambiguous matches in the pilot. Start with the reported 50-storey lead as an open identification question. A verified floor count can appear in inspection alongside a missing metre height.
4. Publish a compact findings register showing admitted, conflicting, unmatched and excluded records, plus why. If a source brings no verified improvement in a pilot area, ship the useful existing-source changes and return the gaps for later investigation.

### 1. Make the geographic view readable before adding detail

- Refine the existing city and low-angle views around distinct scenes. Tejgaon should show the tower cluster against industrial plots. Motijheel should read as a commercial core. Old Dhaka should show fine blocks and the relationship between lanes and the Buriganga, using existing source roads, water and footprints. Use the current district jump to reach the scenes and keep direct URLs stable.
- Use the existing palette for building use only where the source identifies the use. Give unknown uses a neutral treatment. Test selective footprint edges, native depth and label placement at matched scales. The map itself should carry the contrast between areas. Keep streets and courtyards readable beside towers and under strong visual overlays. [MapLibre native extrusion example](https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/)
- Extend the existing baker and coverage register if the pilot qualifies new data. Keep metre height and storeys separate. Resolve a tower and podium as parts only where the source defines both, with individually supported heights and bases. Preserve polygon holes. Give each renderable surface one owner across source, zoom, area extent and mode. Prove that panning across the Parliament boundary neither drops ordinary footprints nor produces duplicate or flickering faces.
- Make selected-building evidence reachable from keyboard and pointer. Show building identity when known, source ID, height and method, footprint source/date, construction status where evidenced, and any conflict. Missing values stay explicitly missing. Start with `public/app.js`, `public/walk.js`, `public/dhaka-design.css`, the existing inspector and registry, and `scripts/bake-city-heights.py`. Add a new dataset or helper only where the pilot requires it.

### 2. Give Parliament two useful scales

**Campus on the map.** Use the captured footprints and courtyard rings with sourced open areas, public street context and water geometry where available. Frame the main block and lake from existing heritage and area entry points. Preserve 2D and the streamed fallback under failed or slow detail downloads. Inspect the main block, a courtyard and the lake edge at the transition between city and campus. Large screens and manual pans are part of the test.

**Exterior in the heritage reference.** Check whether the exact hrahaman listing offers an authorized download and permits redistribution and adaptation, including any textures. This review found its public embed and a 403 on the listing fetch. Download rights are unverified. Check the rights of any archival material separately. Use the existing reference viewer for a licensed, optimized GLB, or build an original exterior study from usable documented geometry if a bounded prototype proves viable. The official Parliament description and Archnet collection are leads. For example, the official chamber height is an interior dimension and cannot establish roof elevation. Record source, revision, scale, excluded elements and rights in the asset manifest. [Sketchfab model embed](https://sketchfab.com/models/4d1a857061b646ef8c9fea2124b1f504) · [Bangladesh Parliament](https://www.parliament.gov.bd/about/history) · [Archnet archive](https://www.archnet.org/sites/70)

Start with city footprints, campus geometry and exterior detail as three levels of detail. Keep exterior detail in `public/parliament-reference.html` and its existing viewer unless independently verifiable control points, elevations and placement justify a later map integration. Require a documented fit across at least three separated control points with measured residuals and source accuracy before proposing geographic placement. Publish an unscaled schematic qualification where scale is unsupported. Give missing/corrupt GLB and WebGL failure a usable fallback, and dispose viewer resources on exit. The user can rotate the exterior or choose a fixed view with accessible controls. The scope is exterior architecture and public geographic context.

### 3. Use existing civic evidence to answer questions about a place

- Reuse Map evidence and Satellite samples by place. Test that a reader can recover the observation time, method, resolution and missing reason for one reading. Verify one actual compatible archive pair once it exists. The comparison should show both dates and values, their units and delta, sample footprint and archive references. Continue to refuse censored values, mixed methods, changed footprints or undated archives.
- Audit the existing air and flood journeys before expanding feeds. Start with regional CAMS playback, dated satellite flood imagery and the river outlook. Improve shared play, pause, scrub, time labels and unavailable frames only where current interactions fail. A frame must show its actual granularity, timestamps and modeled or observed basis. Keep regional air at native scale and retain unavailable states for unsupported neighborhood or building claims. Manual input, hidden tab, task exit and reduced motion retain their existing ownership guarantees.
- Sample the existing planning, transit, economy and population flows for preservation and useful failure states. Treat authoritative hydrology, validated station history and economic bulletins as separate source qualification work. Any future local flood guidance requires measured gauge evidence and datums, credible mapping to locations, validation against events and a separate acceptance review. Shelter/route eligibility needs a separate evidence and review process. Keep that work out of the rendering pilot.

### 4. Check the user journey, data and operating cost

| Gate | Evidence required |
|---|---|
| Read the city | At matched scales, find the named district, distinguish at least two street/block patterns, select a building and explain how its height is supported. Try the tasks with an independent reviewer and ask Dhaka readers when available. Save before/after images and observed failures. |
| Preserve the map | Verify all existing footprint sets, courtyard rings, type colours, deep links, manual camera, keyboard focus, map inspection, 2D and background lifecycle. Test a repeated zoom/extent crossing, language swap, missing-height feature, mismatched parent/part and slow/offline Retry. Actor and reason stay visible for each evidence state. |
| Keep it compact | Real 390×844, 1024×768 and 1440×900 pixels in English and Bengali, plus doubled semantic text. Fit the existing 48 px normal header budget, keep at least 60% visible map, and preserve readable attribution and complete watch values. A different reviewer checks phone interaction, screenshots and focus flow. |
| Keep it light | Reproduce cold and warm runs on a mid-range Android or record the actual device gap. Fix the useful-map event beforehand as map visible, pan/zoom responsive and a footprint or qualifying fallback inspectable. Use at least five repeated comparable runs for each cold baseline and candidate. Compare median and worst time, encoded bytes, main-thread long tasks and repeated-navigation memory. Report warm runs separately. |
| Budget additions | Proposed pilot allowances: at most 25 KiB encoded new eager first-party assets, 250 KiB per optional scene extract, and 750 KiB for the first useful exterior detail. No eager campus or exterior body on the ordinary city entry. A visible fallback must still work if a budget is missed. Report median first-useful-map regression above 10% against the paired baseline and resolve it before shipping. Treat larger assets or new delivery infrastructure as a separate design choice supported by measurements. |
| Fail truthfully | Verify slow or missing basemap, timeout or corrupt detail, repeated abort, stale source and unavailable playback. Keep plain bilingual evidence, exact source or reason, and a working Retry where the request can be retried. Test producer and reader for any new provenance fields. |
| Ship with receipts | Run the complete configured npm suite, typecheck and local verification. Run the canonical release with one authorized writer. Match live assets and build ID, run independent API and data checks, then repeat key browser flows on the custom domain. Preserve initial failed checks and separate code acceptance from upstream availability. |

## Approval boundary

Approve the pilot and staged release together, with three decisions driven by evidence during execution. The coverage review decides which new heights can ship. The rights and device checks decide whether Parliament exterior detail can ship with the campus. Measurements decide whether any tile conversion or extra runtime is justified. A citywide survey, a new framework, paid data, live emergency guidance and production storage changes are outside this scope.

Deliver the four-scene baseline, dated coverage register and reproducible source manifest first. Ship the useful street and campus improvements as the first increment. Finish with the detailed exterior and civic evidence improvements that pass their gates, followed by the live proof and the bounded backlog that the evidence still leaves open.
