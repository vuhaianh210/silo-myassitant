# Silo App Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Silo's letter-based icon with the approved flat wallet icon and wire a native 180×180 PNG into the iPhone Home Screen installation path.

**Architecture:** Keep the icon source deterministic and dependency-free as two equivalent SVG files sharing one 180-unit geometry. Generate the iPhone PNG from the 512 SVG with macOS Quick Look, then use a temporary Swift program with built-in CoreGraphics/ImageIO to remove only its connected exterior white background. No third-party runtime or build dependency is required. Verify artwork, dimensions, alpha, references, and offline caching with one Node built-in test file.

**Tech Stack:** SVG, PNG, semantic HTML, Web App Manifest, Service Worker, macOS `qlmanage`/`sips`, built-in Swift/CoreGraphics/ImageIO, Node.js built-in `node:test`.

## Global Constraints

- Repository root: `/Users/vuhaianh/silo-myassitant`.
- Design authority: `docs/superpowers/specs/2026-09-03-silo-app-icon-design.md`.
- Approved direction: C, “Ví tối giản”.
- Background is solid Silo green `#0B7A53`; no gradients, shadows, textures, letters, currency symbols, or remote assets.
- Wallet body is `#F5FFF9`, pocket is `#C9F0DD`, and the secondary gold element is `#F6C453`.
- Both SVG files use identical `viewBox="0 0 180 180"` geometry; only intrinsic dimensions differ.
- The iPhone icon is exactly 180×180 PNG and is rasterized from the approved SVG.
- The PNG alpha repair uses only built-in macOS Swift/CoreGraphics/ImageIO in a temporary `/tmp` script; no third-party runtime or build dependency is required.
- Preserve relative GitHub Pages URLs and existing manifest SVG entries.
- Increase the service-worker cache name and cache the PNG.
- Do not modify application behavior, financial data, categories, or screen layout.
- Do not push to GitHub without explicit owner approval.

## Planned File Map

| File | Action | Responsibility |
|---|---|---|
| `icons/icon-192.svg` | Replace | 192×192 PWA icon using approved wallet geometry. |
| `icons/icon-512.svg` | Replace | 512×512 PWA icon using identical wallet geometry. |
| `icons/apple-touch-icon.png` | Create | 180×180 iPhone Home Screen icon rasterized from SVG. |
| `index.html` | Modify | Point `apple-touch-icon` to the PNG while retaining SVG favicon. |
| `sw.js` | Modify | Cache the PNG and force installed clients to discover the asset update. |
| `tests/icon-assets.test.js` | Create | Verify artwork contract, geometry parity, dimensions, references, and cache inclusion. |

---

### Task 1: Replace and integrate the Silo icon set

**Files:**

- Create: `tests/icon-assets.test.js`
- Replace: `icons/icon-192.svg`
- Replace: `icons/icon-512.svg`
- Create: `icons/apple-touch-icon.png`
- Modify: `index.html:9`
- Modify: `sw.js:1-8`

**Interfaces:**

- Consumes: approved colors and geometry from `docs/superpowers/specs/2026-09-03-silo-app-icon-design.md`.
- Produces: browser assets at `icons/icon-192.svg`, `icons/icon-512.svg`, and `icons/apple-touch-icon.png`; no JavaScript API.

- [ ] **Step 1: Confirm the repository baseline**

Run:

```bash
cd /Users/vuhaianh/silo-myassitant
git status --short
git log -2 --oneline
node --version
```

Expected: clean status because `.superpowers/` and `.worktrees/` are ignored; the latest commit is `8260724 chore: ignore local workspaces`; Node.js is available.

- [ ] **Step 2: Write the failing icon contract test**

Create `tests/icon-assets.test.js` exactly as follows:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const svg192 = await readFile(new URL('icons/icon-192.svg', root), 'utf8');
const svg512 = await readFile(new URL('icons/icon-512.svg', root), 'utf8');
const index = await readFile(new URL('index.html', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const worker = await readFile(new URL('sw.js', root), 'utf8');

function normalizeIntrinsicSize(svg) {
  return svg.replace(/width="(?:192|512)" height="(?:192|512)"/, 'width="SIZE" height="SIZE"');
}

function decodePng(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  let width;
  let height;
  let colorType;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      assert.equal(data[8], 8); colorType = data[9]; assert.ok([2, 6].includes(colorType));
      assert.equal(data[10], 0); assert.equal(data[11], 0); assert.equal(data[12], 0);
    }
    if (type === 'IDAT') idat.push(data);
    offset += length + 12;
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(stride * height);
  let rawOffset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rawOffset++];
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y === 0 ? null : pixels.subarray((y - 1) * stride, y * stride);
    for (let x = 0; x < stride; x++) {
      const value = raw[rawOffset++];
      const left = x >= channels ? row[x - channels] : 0;
      const up = prior ? prior[x] : 0;
      const upLeft = prior && x >= channels ? prior[x - channels] : 0;
      if (filter === 0) row[x] = value;
      else if (filter === 1) row[x] = (value + left) & 255;
      else if (filter === 2) row[x] = (value + up) & 255;
      else if (filter === 3) row[x] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        row[x] = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 255;
      } else assert.fail(`Unsupported PNG filter ${filter}`);
    }
  }
  return { width, height, channels, pixels };
}

function alphaAt(png, x, y) {
  return png.channels === 4 ? png.pixels[(y * png.width + x) * 4 + 3] : 255;
}

test('SVG icons contain only the approved wallet artwork', () => {
  for (const [size, svg] of [[192, svg192], [512, svg512]]) {
    assert.match(svg, new RegExp(`width="${size}" height="${size}"`));
    assert.match(svg, /viewBox="0 0 180 180"/);
    for (const color of ['#0B7A53', '#F5FFF9', '#C9F0DD', '#F6C453']) assert.match(svg, new RegExp(color, 'i'));
    assert.doesNotMatch(svg, /linearGradient|radialGradient|<text|₫|>S</i);
  }
  assert.equal(normalizeIntrinsicSize(svg192), normalizeIntrinsicSize(svg512));
});

test('iPhone icon is a 180 by 180 PNG with transparent outer corners', async () => {
  const png = await readFile(new URL('icons/apple-touch-icon.png', root));
  const decoded = decodePng(png);
  assert.deepEqual({ width: decoded.width, height: decoded.height }, { width: 180, height: 180 });
  for (const [x, y] of [[0, 0], [179, 0], [0, 179], [179, 179]]) assert.equal(alphaAt(decoded, x, y), 0);
  assert.ok(alphaAt(decoded, 33, 0) > 0 && alphaAt(decoded, 33, 0) < 255, 'rounded edge has fractional alpha');
  assert.equal(alphaAt(decoded, 50, 50), 255);
});

test('HTML, manifest, and service worker reference the complete local icon set', () => {
  assert.match(index, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
  assert.match(index, /<link rel="icon" type="image\/svg\+xml" href="icons\/icon-192\.svg">/);
  assert.deepEqual(manifest.icons.map(icon => icon.src), ['icons/icon-192.svg', 'icons/icon-512.svg']);
  for (const path of ['./icons/icon-192.svg', './icons/icon-512.svg', './icons/apple-touch-icon.png']) {
    assert.match(worker, new RegExp(path.replaceAll('.', '\\.')));
  }
  assert.match(worker, /keys\.filter\(key => key\.startsWith\('silo-'\) && key !== CACHE_NAME\)/);
});
```

- [ ] **Step 3: Run the test and verify the correct failure**

Run:

```bash
node --test tests/icon-assets.test.js
```

Expected: FAIL because `icons/apple-touch-icon.png` does not exist and the current SVG uses the old gradient letter artwork.

- [ ] **Step 4: Replace the 192 SVG with the approved geometry**

Replace `icons/icon-192.svg` with:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 180 180" role="img" aria-labelledby="title">
  <title id="title">Silo</title>
  <rect width="180" height="180" rx="42" fill="#0B7A53"/>
  <path d="M40 59c0-11 9-20 20-20h60c11 0 20 9 20 20v62c0 11-9 20-20 20H60c-11 0-20-9-20-20V59Z" fill="#F5FFF9"/>
  <path d="M59 61h53" fill="none" stroke="#0B7A53" stroke-width="7" stroke-linecap="round"/>
  <path d="M101 78h41v39h-41c-11 0-20-9-20-20s9-19 20-19Z" fill="#C9F0DD" stroke="#0B7A53" stroke-width="7" stroke-linejoin="round"/>
  <circle cx="106" cy="97" r="7" fill="#F6C453"/>
</svg>
```

- [ ] **Step 5: Replace the 512 SVG with identical geometry**

Replace `icons/icon-512.svg` with:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 180 180" role="img" aria-labelledby="title">
  <title id="title">Silo</title>
  <rect width="180" height="180" rx="42" fill="#0B7A53"/>
  <path d="M40 59c0-11 9-20 20-20h60c11 0 20 9 20 20v62c0 11-9 20-20 20H60c-11 0-20-9-20-20V59Z" fill="#F5FFF9"/>
  <path d="M59 61h53" fill="none" stroke="#0B7A53" stroke-width="7" stroke-linecap="round"/>
  <path d="M101 78h41v39h-41c-11 0-20-9-20-20s9-19 20-19Z" fill="#C9F0DD" stroke="#0B7A53" stroke-width="7" stroke-linejoin="round"/>
  <circle cx="106" cy="97" r="7" fill="#F6C453"/>
</svg>
```

- [ ] **Step 6: Rasterize the approved SVG into the iPhone PNG**

Run on the Mac:

```bash
mkdir -p /tmp/silo-icon-build
qlmanage -t -s 180 -o /tmp/silo-icon-build icons/icon-512.svg
cp /tmp/silo-icon-build/icon-512.svg.png icons/apple-touch-icon.png
```

Dùng công cụ chỉnh sửa apply_patch (không phải lệnh shell) để tạo file tạm `/tmp/silo-icon-build/repair-alpha.swift` với nội dung chính xác sau:

```swift
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let source = CGImageSourceCreateWithURL(input as CFURL, nil)!
let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
let width = image.width
let height = image.height
let bytesPerRow = width * 4
let colorSpace = CGColorSpaceCreateDeviceRGB()
var pixels = [UInt8](repeating: 0, count: bytesPerRow * height)
let context = CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: bytesPerRow, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
let sourcePixels = pixels
let green: (UInt8, UInt8, UInt8) = (11, 122, 83)

func matteAlpha(_ index: Int) -> UInt8? {
  let values = [
    Double(255 - sourcePixels[index]) / Double(255 - green.0),
    Double(255 - sourcePixels[index + 1]) / Double(255 - green.1),
    Double(255 - sourcePixels[index + 2]) / Double(255 - green.2)
  ]
  let alpha = values.reduce(0, +) / 3
  guard alpha >= 0, alpha < 0.999, (values.max()! - values.min()!) < 0.03 else { return nil }
  return UInt8((alpha * 255).rounded())
}

var seen = [Bool](repeating: false, count: width * height)
var queue: [(Int, Int)] = []
for point in [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)] {
  let index = (point.1 * width + point.0) * 4
  if matteAlpha(index) != nil { seen[point.1 * width + point.0] = true; queue.append(point) }
}
var head = 0
while head < queue.count {
  let (x, y) = queue[head]
  head += 1
  let index = (y * width + x) * 4
  let alpha = matteAlpha(index)!
  pixels[index] = green.0; pixels[index + 1] = green.1; pixels[index + 2] = green.2; pixels[index + 3] = alpha
  for (nx, ny) in [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)] where nx >= 0 && nx < width && ny >= 0 && ny < height {
    let pixel = ny * width + nx
    let neighbor = pixel * 4
    if !seen[pixel] && matteAlpha(neighbor) != nil { seen[pixel] = true; queue.append((nx, ny)) }
  }
}

let data = Data(pixels)
let provider = CGDataProvider(data: data as CFData)!
let repaired = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: bytesPerRow, space: colorSpace, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue), provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)!
let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(destination, repaired, nil)
guard CGImageDestinationFinalize(destination) else { fatalError("Could not write PNG") }
```

```bash
swift /tmp/silo-icon-build/repair-alpha.swift icons/apple-touch-icon.png /tmp/silo-icon-build/apple-touch-icon-alpha.png
cp /tmp/silo-icon-build/apple-touch-icon-alpha.png icons/apple-touch-icon.png
sips -g pixelWidth -g pixelHeight icons/apple-touch-icon.png
```

Quick Look flattens transparent SVG corners and anti-aliased edge pixels against white. The temporary Swift flood fill begins only at the four raster corners, recovers fractional alpha from the known green/white matte, and stops before the solid green tile, so the disconnected white wallet body remains opaque. Do not commit the helper script. Swift, CoreGraphics, and ImageIO are built into macOS; no third-party runtime or build dependency is required.

Expected final output includes, with the automated icon test confirming alpha 0 at all four corners and alpha 255 within the wallet body:

```text
pixelWidth: 180
pixelHeight: 180
```

- [ ] **Step 7: Point iPhone installation to the PNG**

In `index.html`, replace the existing Apple icon line with exactly:

```html
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
```

Keep the following SVG favicon line unchanged:

```html
<link rel="icon" type="image/svg+xml" href="icons/icon-192.svg">
```

- [ ] **Step 8: Version and cache the new icon**

In the controlled Silo 2.0 `sw.js`, retain the existing `silo-v2` cache name, full `APP_SHELL`, message handler, and fetch strategy. Its app shell must include all three icon assets and activation must delete only older Silo caches:

```js
const APP_SHELL = ['./', './index.html', './styles.css', './app.js', './logic.js', './storage.js', './manifest.json', './icons/icon-192.svg', './icons/icon-512.svg', './icons/apple-touch-icon.png'];
// …existing controlled handlers…
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('silo-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
```

Do not replace the controlled install, activate, message, or fetch handlers.

- [ ] **Step 9: Run the automated icon gate**

Run:

```bash
node --test tests/icon-assets.test.js
git diff --check
git status --short
```

Expected: three tests PASS, `git diff --check` prints nothing, and status lists only the six planned icon-related files.

- [ ] **Step 10: Render the 48-pixel inspection copy**

Run:

```bash
sips -z 48 48 icons/apple-touch-icon.png --out /tmp/silo-icon-48.png
sips -g pixelWidth -g pixelHeight /tmp/silo-icon-48.png
```

Expected final output includes `pixelWidth: 48` and `pixelHeight: 48`. Inspect both `icons/apple-touch-icon.png` and `/tmp/silo-icon-48.png`: the wallet body, mint pocket, and gold stud are centered and recognizable, with no clipping or unintended transparency inside the green tile.

- [ ] **Step 11: Commit the icon set without brainstorm artifacts**

Run:

```bash
git add icons/icon-192.svg icons/icon-512.svg icons/apple-touch-icon.png index.html sw.js tests/icon-assets.test.js
git diff --cached --check
git commit -m "feat: add Silo wallet app icon"
```

Expected: one focused commit containing six files. `.superpowers/` remains untracked and is not included.

- [ ] **Step 12: Verify the iPhone Home Screen result**

After the main Silo implementation is ready on an HTTPS staging or GitHub Pages URL:

1. Open the URL in Safari on the target iPhone.
2. Remove the previous Silo Home Screen shortcut only if iOS keeps showing its cached old icon.
3. Use Share → Add to Home Screen.
4. Confirm the wallet icon is crisp, centered, visually distinct from nearby icons, and not clipped by the system mask.
5. Launch Silo and confirm the icon-only change did not affect stored financial data or offline startup.

Do not push as part of this task unless the owner explicitly authorizes it.

## Definition of Done

- Both SVGs contain identical approved wallet geometry and no old letter/gradient artwork.
- The PNG is exactly 180×180 and was rasterized from the approved SVG.
- HTML uses the PNG for `apple-touch-icon` and retains the SVG favicon.
- Manifest retains both relative SVG PWA icon entries.
- Service worker caches all three icon files under a new cache name.
- All automated tests pass and the 48-pixel rendering remains recognizable.
- Only the planned files are committed; no push occurs without explicit approval.
