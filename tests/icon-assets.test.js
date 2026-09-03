import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const svg192 = await readFile(new URL('icons/icon-192.svg', root), 'utf8');
const svg512 = await readFile(new URL('icons/icon-512.svg', root), 'utf8');
const index = await readFile(new URL('index.html', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const worker = await readFile(new URL('sw.js', root), 'utf8');

function normalizeIntrinsicSize(svg) {
  return svg.replace(/width="(?:192|512)" height="(?:192|512)"/, 'width="SIZE" height="SIZE"');
}

function pngDimensions(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
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

test('iPhone icon is a real 180 by 180 PNG', async () => {
  const png = await readFile(new URL('icons/apple-touch-icon.png', root));
  assert.deepEqual(pngDimensions(png), { width: 180, height: 180 });
});

test('HTML, manifest, and service worker reference the complete local icon set', () => {
  assert.match(index, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
  assert.match(index, /<link rel="icon" type="image\/svg\+xml" href="icons\/icon-192\.svg">/);
  assert.deepEqual(manifest.icons.map(icon => icon.src), ['icons/icon-192.svg', 'icons/icon-512.svg']);
  for (const path of ['./icons/icon-192.svg', './icons/icon-512.svg', './icons/apple-touch-icon.png']) {
    assert.match(worker, new RegExp(path.replaceAll('.', '\\.')));
  }
});
