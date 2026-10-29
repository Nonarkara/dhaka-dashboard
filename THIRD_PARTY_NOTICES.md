
# Third-party notices

## Sanzo Wada colour data

`data/colors.json` comes from
[`mattdesl/dictionary-of-colour-combinations`](https://github.com/mattdesl/dictionary-of-colour-combinations).
That project corrected and repackaged data first compiled by Dain M. Blodorn
Kim for [`dblodorn/sanzo-wada`](https://github.com/dblodorn/sanzo-wada).

The digital dataset is used under the MIT License:

> Copyright (c) 2020 Matt DesLauriers
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

The historical colour combinations are credited to Sanzo Wada. This project is
independent and is not affiliated with Seigensha, the Wada estate, or the data
authors. It does not reproduce scans, cover art, or publisher text.


Plate 241 digital conversions are not measurements of printed inks.

Barlow Semi Condensed and Hind Siliguri: SIL OFL, license texts in public/fonts.

Daily currency reference: Fawaz Ahmed Currency API, CC0-1.0, https://github.com/fawazahmed0/exchange-api . World Bank WDI series are attributed with individual indicator links and reporting years in the national-data dialog.

## Three.js r168

Self-hosted `public/vendor/three-0.168.0/three.module.js`, from https://unpkg.com/three@0.168.0/build/three.module.js, MIT license retained alongside it in LICENSE. Used for the schematic Parliament model. No third-party architectural model or texture is included.
# Population and facility reference layers

`public/data/people-grid.json` derives from Bondarenko M. et al. (2025), WorldPop Global Demographic Data R2025A v1, Bangladesh constrained population counts for 2025, [DOI 10.5258/SOTON/WP00839](https://doi.org/10.5258/SOTON/WP00839), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: native pixel-centre aggregation into 1 km UTM46N cells and WGS84 coordinate rounding; no third-party textures or imagery are included.

`public/data/facilities.geojson` is derived from © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), via the Geofabrik Bangladesh 261028 extract. Changes: tag selection, representative bounding-box centres for ways/relations, bounded cell assignment and removal of unused tags. The full available derivative database is distributed in the GeoJSON, with its separately licensed provenance manifest. The OSM object-count columns in people-grid.json also retain the OSM source and ODbL licence; only the population fields derive from WorldPop. These facility records are not licensed as WorldPop data. See `docs/PEOPLE-DATA.md` for exact sources, dates, hashes and transformations.
