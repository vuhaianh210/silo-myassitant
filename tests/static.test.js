import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8').catch(() => '');
const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

test('page keeps zoom available and loads external app assets', () => {
  assert.doesNotMatch(index, /user-scalable=no|maximum-scale=1/);
  assert.match(index, /href="styles\.css"/);
  assert.match(index, /src="app\.js" type="module"/);
  assert.doesNotMatch(index, /<style[\s>]/);
  const inlineScripts = [...index.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(inlineScripts.length, 1);
  assert.match(inlineScripts[0][1], /silo_theme/);
});

test('forms expose numeric money entry and named errors', () => {
  assert.match(index, /id="expenseAmount"[^>]*inputmode="numeric"/);
  assert.match(index, /id="incomeAmount"[^>]*inputmode="numeric"/);
  assert.match(index, /data-triple-zero="expenseAmount"/);
  assert.match(index, /data-triple-zero="incomeAmount"/);
  assert.match(index, /id="expenseAmountError"[^>]*role="alert"/);
});

test('app shell contains accessible live and dialog regions', () => {
  assert.match(index, /id="appStatus"[^>]*aria-live="polite"/);
  assert.match(index, /id="storageError"[^>]*role="alert"/);
  assert.match(index, /<dialog[^>]*id="expenseSheet"/);
  assert.match(index, /<dialog[^>]*id="confirmDialog"/);
});

test('styles contain light, dark, safe-area, focus, and reduced-motion rules', () => {
  assert.match(styles, /:root\s*{/);
  assert.match(styles, /\[data-theme="dark"\]/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
});

test('application implements the complete expense interaction surface', () => {
  assert.match(appSource, /function openExpenseEditor\s*\(/);
  assert.match(appSource, /function saveExpense\s*\(/);
  assert.match(appSource, /function renderExpenseList\s*\(/);
  assert.match(appSource, /function renderCategoryFilter\s*\(/);
  assert.match(appSource, /repository\.saveExpenses\s*\(/);
});

test('service worker caches every local application module', () => {
  for (const asset of ['./index.html', './styles.css', './app.js', './logic.js', './storage.js', './manifest.json']) assert.match(worker, new RegExp(asset.replaceAll('.', '\\.')));
  assert.match(worker, /SKIP_WAITING/);
  assert.doesNotMatch(worker, /self\.skipWaiting\(\);/);
});

test('manifest stays standalone, portrait, and relative', () => {
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.orientation, 'portrait'); assert.equal(manifest.start_url, './'); assert.equal(manifest.background_color, '#F4F7F5');
});

test('application source does not render owner data with HTML strings', () => {
  assert.doesNotMatch(appSource, /\.innerHTML\s*=/); assert.doesNotMatch(appSource, /insertAdjacentHTML/); assert.doesNotMatch(index, /onclick=|ontouch/);
});

test('application ships no third-party runtime or analytics endpoint', () => {
  assert.doesNotMatch(index, /https?:\/\//); assert.doesNotMatch(appSource, /fetch\(|XMLHttpRequest|sendBeacon|analytics/i);
});
