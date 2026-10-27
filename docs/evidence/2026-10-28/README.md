# Rendered geometry and model playback

Actual iframe viewports:390×844,1024×900,1440×900,1280×720,plus599/600/601×844. Captures are scaled to the available366px browser pane; internal layout measurements remain at declared viewport sizes. This is geometry/interaction evidence, not full-resolution pixel certification.

The four-band old phone layout measures180.84px before the map. New combined top chrome is48px; map working regions are390×796,1024×852,1440×852 and1280×672. The lens selector ends4.5px before the map starts. Full descriptions/height qualifications remain in evidence disclosures; building legend supplies color-independent use labels; settings, all12lenses, desks,watch,2D/3D,themes and source links remain reachable. User-requested different typography uses two locally hosted font families.

The new48px gate passes all recorded cases; the isolated old DOM+CSS fails. measurements.json is directly collected from renderedDOM. Some early samples record loading before a later populated capture; final populated captures supplement these. Playback panel remains above watch with4px separation and on-screen controls. Source-details deliberately expand within the map; they are not counted as top chrome.

Reproduce locally by copying scripts/fixtures/geometry.html to public/__geometry.html and scripts/fixtures/geometry/before* to public/__before*. Visit /__geometry?w=390&h=844&lang=bn ; addold=1 for falsification, menu=1,key=1,lens=air|rivers. The error=1 flag injects an offline rejection for outlook requests only; it is isolated verification, not a provider outage claim. Read #measure from the outer DOM. Remove temporary public fixture files before release.

Behavior tests exercise real forecast normalization and player code: missing≠zero, unit validation, timestamp/horizon/native-step filtering, dedup, quartile invalidity, upstream failure, early selection/retry camera, paused start, play/pause/scrub, response races and watch restoration. Browser playback visibly advanced validtime and values; Bengali controls and regional framing were checked. Independent review found and closed the early-camera,quartile and building-HUD omissions; final review recorded below.

Independent reviewer closeout: populated1024,Parliament Palette,phoneerror,Bengali river title and updatedfixture checked;14measurementcases reviewed, allnew top48px cases pass and old180.84pxcase fails. Parliament civicred andcourtyards visible. Source/test findings closed; no remaining blocker. Final release checks are recorded after deployment.
