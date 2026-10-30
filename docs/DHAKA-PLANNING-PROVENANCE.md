# Dhaka Planning Mode — Coverage & Validation Report

**Generated:** 2026-10-30
**Status:** Phase 1 — audited reference contracts and source-structure review; no operational guidance
**Live URL:** https://dhaka.nonarkara.org

This report documents what spatial data is known, what is inferred, and what
still requires validation. No evacuation routes are designated or flat-roof buildings marked as safe shelters. Legacy station coordinates are retained as unverified references; this phase creates no new location pins.

---

## 1 · Data sources

| Source | What it provides | Status | Coverage | Verification |
|--------|------------------|--------|----------|--------------|
| Geofabrik Bangladesh OSM extract (261028 PBF) | Roads, paths, buildings, waterways, facilities | Ingested (facilities.geojson, people-grid.json) | Bangladesh-wide, clipped to Dhaka bbox | ODbL attribution; Dhaka-area audit pending |
| WorldPop 2025 R2025A | Population model, 100m cells | Ingested (people-grid.json) | 1,280 cells in Dhaka bbox | CC BY 4.0; modeled, not census |
| OSM school/hospital/clinic | 2,181 facility objects | Ingested (facilities.geojson) | Dhaka bbox | ODbL 1.0; no capacity/opening status |
| BWDB / FFWC station registry | 6 river gauge stations with danger levels | Referenced (unavailable readings) | Buriganga, Turag, Balu, Shitalakshya, Tongi Khal, Dhaleshwari | Registry coordinates unreviewed; no live gauge feed |
| FFWC API (api3.ffwc.gov.bd) | Candidate gauge/forecast source | Browser fetch returned 502 during this audit | — | No payload or adapter validated |
| DDM AWARE shelter info | Table plus embedded structured inventory with lat/lon | Source structure reviewed; 1,950 records/coordinate pairs | Five source points inside population-grid extent; municipal coverage unknown | Locations, source update date, readiness and reuse terms unreviewed |
| NASA GIBS / POWER / CAMS | Satellite radiance, LST, aerosol, solar | Measured (collage) | 14 sampled districts | 86/98 readings; modeled provenance |

## 2 · SpatialEvidence contract

`SpatialEvidence` defines the planning contract. Legacy river references are annotated; existing population/facility layers retain their own manifests. This is not a claim that every spatial feature has already migrated:

```typescript
interface SpatialEvidence {
  sourceName: string;
  sourceUrl: string;
  sourceFeatureId: string | null;
  retrievedAt: string | null;
  observedAt: string | null;
  license: string | null;
  evidenceClass: "unverified_reference" \| "official_inventory" \| "community_mapped" \| "remote_sensing_derived" \| "model_output" \| "field_verified";
  geometryMethod: "unverified" \| "source_geometry" \| "reviewed_geocode" \| "documented_derivation";
  positionalAccuracyM: number | null;
  verificationStatus: "unreviewed" \| "reviewed" \| "field_verified";
  limitations: string[];
}
```

River stations carry `evidenceClass: "unverified_reference"`, `geometryMethod: "unverified"`, and `verificationStatus: "unreviewed"`. Their legacy codes/values remain visible, but `sourceFeatureId`, retrieval date, positional accuracy and licence remain null. A provider homepage establishes neither a record-level match nor surveyed threshold/datum provenance.

## 3 · Study boundary

**DHAKA_STUDY_BOUNDARY** — population-grid study extent (not DNCC/DSCC):
- [90.23895227009733, 23.594164517100097, 90.55988906432036, 23.960378575820744] (EPSG:4326)
- Source: public/data/people-manifest.json; scripts/refresh-people.py expands atlas bbox [90.25,23.60,90.55,23.95] to complete 1 km UTM46N cells and exports outer corners to WGS84.
- Limitations: no administrative-boundary match or planning validation. Facility references are clipped to this grid; legacy river stations may lie outside it. An authored-area point envelope is not a municipal boundary.

## 4 · Flood scenario types

Three scenario types are declared, kept separate because each requires different evidence:

| ID | Label | Evidence basis |
|----|-------|----------------|
| `river_flood` | River flood | Requires gauge levels and verified danger levels with matching vertical datum |
| `rainfall_waterlogging` | Rainfall waterlogging | Urban drainage response to intense local rainfall; not a river threshold |
| `compound_flood` | Compound flood | Coincident river flood and rainfall waterlogging; requires both evidence streams |

**No river threshold is reused as an implicit citywide waterlogging trigger.** All six station flood assessments remain `unavailable` with `tier: null` and `reasonCode: "validated-flood-assessment-not-connected"`.

## 5 · Shelter register

**DDM shelter register (SHELTER_REGISTER)** starts empty:
- 0 imported entries and 0 published pins; this is not a claim that the source has no shelters
- Pin eligibility requires finite paired coordinates inside the study extent, traceable source ID/retrieval, reviewed geometry and a dated publication-permission review. The importer boolean alone cannot publish a pin. Pending geometry and reviewer/contact details are withheld from public projection.
- The DDM table omits coordinate columns, but inline JSON contains 1,950 records with finite non-origin lat/lon pairs. Five pairs fall inside this study extent. No individual location is reviewed; neither counts nor presence establish DNCC/DSCC coverage.
- `covering_people` is source-reported, not verified available capacity
- Personal contact details are not republished
- Reuse terms pending review — treated as publicly accessible, not open data

**Operational readiness** (ShelterReadiness) is kept separate from the source listing:
- operationalStatus, capacityVerified, accessibilityReviewed, structuralAssessment, ownerOperatorPermission and operatingArrangements are not inferred from a listing or reviewed geometry. Review flags are not assessments of safety.

## 6 · What is NOT done (deliberately)

- No new shelter coordinates published; legacy river source matches remain unverified
- ❌ No designated evacuation routes — future route work must distinguish mapped networks, calculated routes, scenario assessment, authority designation and recent field checks
- ❌ No flat-roof buildings marked as safe shelters — no roof-form classification or refuge suitability assessment is connected
- ❌ No live river gauge data — current_level_m is null for all 6 stations
- ❌ No flood warning tiers — all stations report `unavailable`
- ❌ No public-facing evacuation guidance — coverage and validation report is a prerequisite

## 7 · API endpoints

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/api/dhaka/rivers` | Live | 6 stations, scenarioTypes, studyBoundary, evidence on each station; floodRisk unavailable |
| `/api/dhaka/shelters` | Reference | Imported register empty; separate dated source-structure counts, stable retrieval time and publication gate |
| `/api/atlas/watch` | Live | floodRisk: unavailable; air/weather modeled |
| `/api/atlas/people` | Live | WorldPop + OSM facilities manifest with hashes and limits |
| `/api/atlas/collage` | Live | 7 instruments, 14 districts, 86/98 measurements |

## 8 · Next steps (Phase 2)

1. Validate a station-level FFWC payload, timestamp, units, vertical datum and authoritative geometry; environment reachability is not a global source-outage claim.
2. Cache FFWC responses server-side with stale-data states
3. Review the five source points inside the population-grid extent individually, establish reuse permission and administrative coverage before importing/publication. Source coordinates alone do not establish a safe shelter.
4. Build candidate pedestrian graph from OSM extract, clipped to study boundary
5. Add building footprints, waterways and mapped facilities with provenance panels
6. Return updated coverage report before enabling any evacuation guidance

## Audit and reproducibility

`node scripts/review-ddm-source.mjs /private/path/source.html ACTUAL_CAPTURE_TIMESTAMP_ISO` parses the embedded JSON as data without executing scripts. It writes only aggregate counts, source URL/retrieval timestamp/HTML SHA-256, extent/method and limitations to public/data/ddm-source-review.json and the generated Worker constant. No source records, coordinates, names or contacts enter those artifacts. Source observation/update date is unknown. Pass the actual capture time; a later copy/modification time is not a retrieval time. Multiple shelter declarations are rejected for re-review. The source HTML remains outside the repository. A later source change requires another explicit review; visitor requests never fetch the DDM page.

The bilingual flood desk exposes the scope and distinction between source records, imported register and published pins. Retrieval time is fixed to the source review, while response timestamp is request time. API metadata contains native Bengali rather than mixed Korean/Spanish copy. Planning contracts, pin/privacy counterexamples, offline UI states and source parser fixtures are executable release gates.
