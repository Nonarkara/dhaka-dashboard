# Population and mapped facilities

This is a dated reference lens, not a live population counter or a service-access assessment. It adds 1,280 metric cells and 2,181 mapped objects without replacing the satellite instruments or any 3D buildings.

## Population

Bondarenko M. et al. (2025), WorldPop Global Demographic Data R2025A v1, Bangladesh constrained population counts for 2025. [DOI 10.5258/SOTON/WP00839](https://doi.org/10.5258/SOTON/WP00839), CC BY 4.0. The [STAC item](https://api.stac.worldpop.org/collections/BGD/items/bgd_pop_2025_CN_100m_R2025A_v1) describes the units as estimated people per pixel, not a density to multiply by square kilometres. Native pixels are 3 arcseconds, approximately 100 m at the equator.

Native pixel centres are transformed to UTM46N/EPSG32646 and assigned to complete 1 km × 1 km cells. Their valid counts are summed without interpolation or coverage correction. The public grid ships WGS84 coordinates rounded to 5 decimals. The area covers the atlas bounding box plus whole-cell margins; it is not a municipal or ward boundary.

Nodata −99999 and nonfinite/negative values stay unknown; valid 0 stays 0. All-nodata cells have null population. A positive estimate is never rounded to 0 in storage. The UI rounds positive estimates to the nearest 10 and shows <10 for small positive values. Valid-pixel counts are supplied separately; that share is not a confidence or accuracy score. No uncertainty interval was supplied by the source. This is a 2025 model estimate, not a census or current residents.

## Facilities

[OpenStreetMap contributors, ODbL 1.0](https://www.openstreetmap.org/copyright), via [Geofabrik Bangladesh, fixed 261028 extract](https://download.geofabrik.de/asia/bangladesh-261028.osm.pbf). Replication timestamp 2026-10-28T21:21:02Z. Public Overpass endpoints failed during acquisition; no response from those failures is included.

Select nodes, ways and relations with amenity=school/hospital/clinic or healthcare=hospital/clinic. Node coordinates stay points. Ways/relations use the bounding-box centre of their complete referenced geometry. Retain centres inside the bounded reference extent, then assign those centres to metric grid cells. These are representative positions, not entrances or travel-time origins. Exact OSM IDs are unique; objects from the same campus may still represent one institution. Missing objects and 0 mapped objects never prove that no institution exists. Counts contain no beds, pupils, opening status, catchments or service adequacy. Names are source text; private contact tags and contributor details are excluded.

Population and facilities retain their separate licences. The manifest carries the full PBF hash, intermediate extract hash, TIFF hash, source versions, method, dates, grid CRS and published asset hashes. The browser verifies SHA-256 before installing either reference asset, rejecting mixed versions.

## Rebuild

Use Python with rasterio 1.4.3, numpy 1.26.4, pyproj 3.6.1, and osmium CLI 1.19.1. Download the fixed PBF above and the TIFF URL in `public/data/people-manifest.json`, plus the STAC item. Do not commit the large raw files.

```sh
python3 scripts/extract-facilities.py --pbf /path/bangladesh-261028.osm.pbf --source https://download.geofabrik.de/asia/bangladesh-261028.osm.pbf --output /path/facilities-extract.json
python3 scripts/refresh-people.py --raster /path/population.tif --stac /path/worldpop-item.json --osm /path/facilities-extract.json --query /path/selection.txt --osm-endpoint https://download.geofabrik.de/asia/bangladesh-261028.osm.pbf
npm run test:people:gis
npm test
```

For PBF input the manifest's selection method comes from the extract, so selection.txt is unused. The refresh script also accepts a complete dated Overpass JSON with a recorded query; it rejects partial/timeout remarks. New reference files are refreshed explicitly and shipped together, not silently presented as automatic collection.

The exact TIFF and intermediate facility input are archived privately in R2 `dhaka-observations` under `reference/people/worldpop-<SHA256>.tif` and `reference/people/osm-<SHA256>.json`. Restore those bytes by their manifest hashes to reproduce the published assets if a source URL disappears. The intermediate records preserve all positions/categories/names used by this release; the original PBF hash and extraction code document their derivation.
