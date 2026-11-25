import {readFileSync,writeFileSync} from 'node:fs';
const data=JSON.parse(readFileSync('public/data/city-height-buildings.geojson','utf8'));
const review=JSON.parse(readFileSync('docs/data/skyline-review-2026-11-25.json','utf8'));
const result={schemaVersion:1,status:'reference',capturedAt:data.metadata.retrieved_at,reviewedAt:review.checkedAt,
  sourceHeightFootprints:data.features.length,captureAreas:data.metadata.inputs.map(i=>({bbox:i.bbox,sourceUrl:i.source_url,capturedAt:i.retrieved_at,heightCandidates:i.source_height_objects})),
  methods:{osmHeightTag:data.features.filter(f=>f.properties.height_method==='osm-height-tag').length,publishedProjectHeight:data.features.filter(f=>f.properties.height_method==='published-project-height').length},
  heightConflicts:data.features.filter(f=>f.properties.height_conflict).map(f=>({featureId:f.id,name:f.properties.name,heightM:f.properties.height_m,osmHeightM:f.properties.osm_height_m,reason:f.properties.height_conflict,sourceUrl:f.properties.height_source_url})),
  omittedInputObjects:data.metadata.omitted_feature_count,coverageNote:data.metadata.coverage_note,geometryNote:data.metadata.geometry_note,license:data.metadata.license,
  review:{...review,newGeometryImported:review.candidates.filter(c=>c.newGeometryImported).length}};
writeFileSync('public/data/skyline-coverage.json',JSON.stringify(result,null,2)+'\n');
console.log(`Coverage register: ${result.sourceHeightFootprints} source-height footprints; ${review.candidates.length} reviewed candidates; ${result.review.newGeometryImported} new geometries.`);
