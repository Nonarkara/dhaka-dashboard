# Dhaka Planning Mode — Coverage & Validation Report

**Generated:** 2026-10-30
**Status:** Phase 1 — data contract and study boundary only
**Live URL:** https://dhaka.nonarkara.org

This report documents what spatial data is known, what is inferred, and what
still requires validation. No evacuation routes are designated, no flat-roof
buildings are marked as safe shelters, and no coordinates are invented.

---

## 1 · Data sources

| Source | What it provides | Status | Coverage | Verification |
|--------|------------------|--------|----------|--------------|
| Geofabrik Bangladesh OSM extract (261028 PBF) | Roads, paths, buildings, waterways, facilities | Ingested (facilities.geojson, people-grid.json) | Bangladesh-wide, clipped to Dhaka bbox | ODbL attribution; Dhaka-area audit pending |
| WorldPop 2025 R2025A | Population model, 100m cells | Ingested (people-grid.json) | 1,280 cells in Dhaka bbox | CC BY 4.0; modeled, not census |
| OSM school/hospital/clinic | 2,181 facility objects | Ingested (facilities.geojson) | Dhaka bbox | ODbL 1.0; no capacity/opening status |
| BWDB / FFWC station registry | 6 river gauge stations with danger levels | Referenced (unavailable readings) | Buriganga, Turag, Balu, Shitalakshya, Tongi Khal, Dhaleshwari | Registry coordinates unreviewed; no live gauge feed |
| FFWC API (api3.ffwc.gov.bd) | Water levels, warnings, forecasts | **Unreachable** from this environment | — | Not tested; adapter not defined |
| DDM AWARE shelter info | Cyclone/flood shelter inventory | Reachable (HTML table) | National; Dhaka coverage unestablished | No coordinates; reuse terms pending review |
| NASA GIBS / POWER / CAMS | Satellite radiance, LST, aerosol, solar | Measured (collage) | 14 sampled districts | 86/98 readings; modeled provenance |

## 2 · SpatialEvidence contract

Every spatial feature carries a `SpatialEvidence` record:

```typescript
interface SpatialEvidence {
  sourceName: string;
  sourceUrl: string;
  sourceFeatureId: string | null;
  retrievedAt: string | null;
  observedAt: string | null;
  license: string | null;
  evidenceClass: "official_inventory" \| "community_mapped" \| "remote_sensing_derived" \| "model_output" \| "field_verified";
  geometryMethod: "source_geometry" \| "reviewed_geocode" \| "documented_derivation";
  positionalAccuracyM: number | null;
  verificationStatus: "unreviewed" \| "reviewed" \| "field_verified";
  limitations: string[];
}
```

River stations carry `evidenceClass: "official_inventory"`, `geometryMethod: "reviewed_geocode"`, `verificationStatus: "unreviewed"`. No station coordinate is treated as a field-verified survey mark.

## 3 · Study boundary

**DHAKA_STUDY_BOUNDARY** — DNCC + DSCC bounding box:
- [90.23895227009733, 23.594164517100097, 90.55988906432036, 23.960378575820744] (EPSG:4326)
- Source: atlas-curated areas list (public/dhaka-areas.json)
- Limitations: bounding-box approximation, not administrative polygons; not a legal jurisdiction or evacuation zone; clip boundary for OSM extract only.

## 4 · Flood scenario types

Three scenario types are declared, kept separate because each requires different evidence:

| ID | Label | Evidence basis |
|----|-------|----------------|
| `river_flood` | River flood | River-station gauge levels relative to surveyed danger levels |
| `rainfall_waterlogging` | Rainfall waterlogging | Urban drainage response to intense local rainfall; not a river threshold |
| `compound_flood` | Compound flood | Coincident river flood and rainfall waterlogging; requires both evidence streams |

**No river threshold is reused as an implicit citywide waterlogging trigger.** All six station flood assessments remain `unavailable` with `tier: null` and `reasonCode: "validated-flood-assessment-not-connected"`.

## 5 · Shelter register

**DDM shelter register (SHELTER_REGISTER)** starts empty:
- 0 entries, 0 mappable
- Reason: no shelter pin is created without source geometry or a reviewed building-level match
- DDM source page is publicly accessible but has no machine-readable API, no coordinates, and unreviewed Dhaka coverage
- `covering_people` is source-reported, not verified available capacity
- Personal contact details are not republished
- Reuse terms pending review — treated as publicly accessible, not open data

**Operational readiness** (ShelterReadiness) is kept separate from the source listing:
- operationalStatus, capacityVerified, accessibilityReviewed, structuralAssessment, ownerOperatorPermission, operatingArrangements — all unreviewed until a separate approval record exists.

## 6 · What is NOT done (deliberately)

- ❌ No invented coordinates — every feature traces to a source record
- ❌ No designated evacuation routes — mapped network, calculated route, scenario-assessed route, authority-designated route, and recently checked route are kept as separate categories
- ❌ No flat-roof buildings marked as safe shelters — roof classification is labeled "Modelled roof form — refuge suitability not assessed"
- ❌ No live river gauge data — current_level_m is null for all 6 stations
- ❌ No flood warning tiers — all stations report `unavailable`
- ❌ No public-facing evacuation guidance — coverage and validation report is a prerequisite

## 7 · API endpoints

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/api/dhaka/rivers` | Live | 6 stations, scenarioTypes, studyBoundary, evidence on each station; floodRisk unavailable |
| `/api/dhaka/shelters` | Live | Register empty (pending review), DDM source documented |
| `/api/atlas/watch` | Live | floodRisk: unavailable; air/weather modeled |
| `/api/atlas/people` | Live | WorldPop + OSM facilities manifest with hashes and limits |
| `/api/atlas/collage` | Live | 7 instruments, 14 districts, 86/98 measurements |

## 8 · Next steps (Phase 2)

1. Test FFWC API payload, timestamps, units, missing values and station geometry (API currently unreachable from this environment)
2. Cache FFWC responses server-side with stale-data states
3. Import DDM shelter records into the reviewable register; review Dhaka-area matches individually
4. Build candidate pedestrian graph from OSM extract, clipped to study boundary
5. Add building footprints, waterways and mapped facilities with provenance panels
6. Return updated coverage report before enabling any evacuation guidance
