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
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'PNG uses 8-bit channels');
      colorType = data[9];
      assert.ok([2, 6].includes(colorType), 'PNG uses RGB or RGBA color');
      assert.equal(data[10], 0, 'PNG uses deflate compression');
      assert.equal(data[11], 0, 'PNG uses standard filters');
      assert.equal(data[12], 0, 'PNG is not interlaced');
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
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
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
