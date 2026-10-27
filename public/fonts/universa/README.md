# Universa Civic

Self-hosted web conversion of Christian Holm's **Universa 2.1**, a METAFONT implementation of Herbert Bayer's Universal. This is the free CTAN implementation chosen by the owner, not P22's commercial revival or a claim of an exact original Bayer reconstruction.

Source: https://ctan.org/pkg/universa

Copyright Christian Holm, 1998. GPL version 2 or later; full terms in `LICENSE.txt`. Original METAFONT sources, documentation and specimen are supplied in `source.zip`. Conversion source: `prepare-universa-font.py` alongside this font (also `scripts/prepare-universa-font.py` in the repository). It traces the distributed medium-upright `fulmr8` specimen using Potrace and emits an independent CFF WOFF2 via fontTools. The chart's marked space is deliberately converted to an empty space; unsupported OT1 punctuation and accents use the dashboard's reading font. No commercial font was copied.

Original archive SHA256: `58fd9768b2cef12c00db5f368ea145c4a21fd7603c22629cb9b1f05f4731cd89`.

Regenerate: `python3 scripts/prepare-universa-font.py` (pypdf, fontTools with Brotli, Potrace). Fonts are not installed globally. The GPL font/source is distributed as an independent asset, alongside the dashboard's separately licensed code.

Universa carries headings and navigation. Source Sans 3 retains long methodology, source evidence and data text; numeric precision and language fallback are preserved. The conversion is proofed in the actual dashboard at phone and desktop widths.
