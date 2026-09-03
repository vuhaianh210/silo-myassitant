# Silo App Icon Design

## Goal

Replace the current letter-based Silo icon with a clear, distinctive wallet mark that remains recognizable on an iPhone Home Screen and matches the Silo 2.0 interface.

## Approved Direction

Use direction C, “Ví tối giản”. The icon is a flat, front-facing wallet centered inside a rounded green app tile.

## Visual Construction

- Canvas: square with a transparent outer canvas and a full-size rounded-square background.
- Background: solid Silo green `#0B7A53`; no gradient, texture, shadow, or photographic effect.
- App-tile corner radius: approximately 23% of the canvas width.
- Wallet body: warm white `#F5FFF9`, with a simple horizontal top seam in Silo green.
- Wallet pocket: pale mint `#C9F0DD`, outlined in Silo green so it remains legible at small sizes.
- Coin/stud: warm gold `#F6C453`.
- Shape language: flat fills, rounded corners, thick strokes, and generous negative space.
- Do not include the letter `S`, the `₫` symbol, a wordmark, tiny details, gradients, or color-only fine lines.

## Small-Size Requirements

- The wallet silhouette must remain understandable at 48×48 CSS pixels.
- Primary elements must stay inside an approximately 18% safe margin.
- No stroke should render thinner than approximately 4% of the 180-unit source view box.
- The gold element must remain secondary; it cannot overpower the wallet silhouette.

## Deliverables

- `icons/icon-192.svg`: vector PWA icon with a 192×192 intrinsic size.
- `icons/icon-512.svg`: identical vector artwork with a 512×512 intrinsic size.
- `icons/apple-touch-icon.png`: raster 180×180 iPhone Home Screen icon.
- Update `index.html` so `apple-touch-icon` references the PNG.
- Keep both SVG icons in `manifest.json` with relative paths.
- Add the PNG to the service-worker application-shell cache.

## Integration Rules

- Preserve the current relative URL structure used by GitHub Pages.
- Do not add a design dependency, remote asset, font, or runtime image request.
- The source artwork must be deterministic and editable as SVG.
- The 192 and 512 SVG files must use the same `viewBox` and geometry; only intrinsic dimensions differ.
- The PNG must be rasterized from the approved SVG artwork, not independently redrawn.
- Increase the service-worker cache version when integrating the new icon so installed devices discover the update.

## Verification

- Parse both SVG files successfully and verify their declared dimensions.
- Verify the PNG is exactly 180×180 and has no accidental transparent gaps inside the rounded tile.
- Confirm `index.html`, `manifest.json`, and `sw.js` reference existing files with relative URLs.
- Inspect the 512, 192, and 48-pixel renderings on light and dark surroundings.
- Install or refresh the PWA on the target iPhone and confirm the Home Screen icon is crisp, centered, and not visually clipped by iOS masking.

## Out of Scope

- Renaming Silo or adding a wordmark.
- Animated, alternate, seasonal, or notification icons.
- Android adaptive-icon foreground/background layers.
- Changes to the Silo application interface beyond icon references and cache metadata.
