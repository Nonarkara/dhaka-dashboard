# SIC — Tableau Public Dhaka Vizzes → DHKx Atlas

Steal / Improve / Credit. All patterns are extracted from public Tableau Public vizzes found at https://public.tableau.com/app/search/vizzes/Dhaka and applied to dhaka.nonarkara.org under MSH / anti-slop / Wada Sanzo Delta & Terracotta constraints.

## Sources

* Zaid Kalam / erazald
  * Daily water demands in Dhaka — https://public.tableau.com/app/profile/erazald/viz/DailywaterdemandinDhaka/Dashboard1
    First 21 Sep 2017, Last 24 Sep 2017. 9,934 views.
  * test-4-dhaka areas — https://public.tableau.com/app/profile/erazald/viz/test-4-dhakaareas/Areasonmap
    First/Last 18 Jul 2017.
  * Dhaka improves on Economist's Safe Cities Index 2019 — https://public.tableau.com/app/profile/erazald/viz/DhakainprovesonEconomistsSafeCitiesIndex2019/Dashboard1
    First 29 Aug 2019. Published on www.thedailystar.net. 13,402 views.
  * Dhaka rivers — https://public.tableau.com/app/profile/erazald/viz/Dhakarivers/Dashboard1
    First/Last 18 Apr 2019.
  * EIU Liveability Index 2019: Dhaka improves a little, now ranks 3rd worst

* Md Touhidur Rahman
  * Dhaka WASA DMA Wise Information — https://public.tableau.com/app/profile/md.touhidur.rahman/viz/DhakaWASADMAwiseInformation/Dashboard2
    First 14 Nov 2021, Last 28 Dec 2021.

* Innovision Consulting / Data Analytics and Emerging Frontiers
  * Dhaka Traffic Trends: Ramadan vs. Non-Ramadan — https://public.tableau.com/app/profile/innovision.consulting/viz/DhakaTrafficDuringRamadan2024/CongestionPeriod
    First 20 Apr 2024, Last 12 Aug 2024.
    Developed by: Data Analytics and Emerging Frontiers, Innovision Consulting. www.innovision-bd.com
    Inspiration: Dhaka Traffic Situation Analysis by Innovision Consulting (original author)
    Published on www.innovision-bd.com

* Al Amin Sheikh
  * Mosquitoes and Monsoons in Dhaka City — https://public.tableau.com/app/profile/al.amin.sheikh/viz/MosquitoesandMonsoonsinDhakaCity/Intro
    First 31 Oct 2025, Last 2 Nov 2025.
    Inspiration: Analyzing weather-Dengue correlation in Dhaka (2020–2025) by Al Amin Sheikh; Mosquitoes and Monsoons An Analytical View of Rainfall vs Dengue Trends by Al Amin Sheikh (original author)

* MIS, DGHS / masud.parvez
  * Dhaka-Division / Dhaka-Division-Update

## What we steal

### Provenance block as first-class UI
Tableau pages surface Developed by, Inspiration, Published on, First/Last Published dates, view counts. Innovision explicitly credits original author.

Steal: A provenance card next to every derived view in DHKx Atlas.
Improve: Keep it in Wada Delta & Terracotta palette, zero radius, hairline rules, bilingual EN/বাংলা parity. Show {source, tier, age, reasonCode} and never fake green/0.
Credit: Innovision Consulting, Al Amin Sheikh, Zaid Kalam.

### Comparison lens framing
Ramadan vs Non-Ramadan is a clean A/B with shared axes, same geography, time-filter toggle.

Steal: Comparison lens UI pattern.
Improve: Implement as `?lens=compare` with left/right split on same map grid, kinetic grid `axial`, one accent amber only, no duplicate chrome.
Apply to: Flood risk pre/post monsoon, WASA DMA supply vs demand, Walk vs City lens.
Credit: Innovision Consulting.

### Administrative granularity naming
WASA DMA Wise Information and MIS DGHS Dhaka-Division use official DMA / Upazila / Thana labels consistently.

Steal: DMA/Thana granularity table with source attribution.
Improve: Use same labels in DHKx Atlas but with honest unavailable states per geographic spatial hallucination law. No invented centroids.
Credit: Md Touhidur Rahman, MIS DGHS.

### Daily demand small multiples + map
Daily water demands pairs choropleth with time series.

Steal: Map + time series pairing, small multiples by DMA.
Improve: Symbol-based watch strip, three type sizes only, watch strip as wide as readings, no equal-height stretching. Bilingual.
Credit: Zaid Kalam.

### Correlation storytelling
Mosquitoes and Monsoons pairs rainfall with dengue with explicit inspiration chain.

Steal: Correlation view with explicit inspiration citation.
Improve: Show modeled proxy with honest labeling, not official warning. Use AQI admin guidance card pattern already shipped.
Credit: Al Amin Sheikh.

## What we improve vs Tableau

* Palette: Wada Sanzo Delta & Terracotta, one accent amber #f59e0b. No Tableau rainbow.
* Geometry: Dieter Rams functional geometry, sharp modernist hairlines, zero border-radius, zero gradients, zero drop-shadows.
* MSH: Header is 4 controls max, watch strip symbol-based, chrome 8-11% viewport, first-screen fit. No floating empty space.
* Bilingual parity: EN/বাংলা for all provenance and UI. Tableau publishes single language.
* Truthfulness: Never fake green or 0. Unavailable endpoints return reasonCode + timestamp. Tableau often hides missing data.
* Geographic spatial hallucination: Prefer no pin over wrong pin. No centroid approximations. Tableau vizzes often approximate.

## Credit listing for UI

Add a `Provenance` panel in the Atlas menu:

Developed by: DEPA · Dr Non Arkaraprasertkul
Inspiration:
- Daily water demands in Dhaka — Zaid Kalam, Tableau Public, 2017
- Dhaka Traffic Trends Ramadan vs Non-Ramadan — Innovision Consulting, 2024
- Dhaka WASA DMA Wise Information — Md Touhidur Rahman, 2021
- Mosquitoes and Monsoons in Dhaka City — Al Amin Sheikh, 2025
- Safe Cities Index 2019 — Zaid Kalam, published on The Daily Star

All links open in new tab. No AI-generated images.

## Ship checklist

* Add provenance module with above credits, bilingual.
* Ensure provenance card respects MSH: label + padding only, no oversized boxes.
* Run npm test, scripts/check-ui-geometry.mjs, npm run typecheck.
* Commit, push, bash scripts/deploy-live.sh, verify live bytes at dhaka.nonarkara.org.

Doc owner: Dr Non
Last updated: 2026-11-09
