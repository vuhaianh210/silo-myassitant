import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

// A small harness for the worker: it stubs the globals the service worker uses and captures the
// fetch handler, so the routing decision can be asserted without a browser.
function worker({ cached = {}, online = true } = {}) {
  const listeners = new Map();
  const store = new Map(Object.entries(cached));
  const fetched = [];
  const keyOf = request => typeof request === 'string' ? request : request.url;
  const response = body => ({ ok: true, body, clone: () => response(body) });
  const self = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    location: { origin: 'https://silo.test' },
    clients: { claim: () => Promise.resolve() },
  };
  const caches = {
    match: async request => store.get(keyOf(request)),
    open: async () => ({ addAll: async () => {}, put: async (request, value) => { store.set(keyOf(request), value); } }),
    keys: async () => [],
    delete: async () => true,
  };
  const fetch = async request => { fetched.push(keyOf(request)); if (!online) throw new Error('offline'); return response('network'); };
  new Function('self', 'caches', 'fetch', source)(self, caches, fetch);
  const send = request => {
    let handled = false;
    let promise;
    listeners.get('fetch')({ request, respondWith: value => { handled = true; promise = value; } });
    return { handled, promise };
  };
  return { send, fetched, store };
}

const navigate = url => ({ method: 'GET', mode: 'navigate', url });

test('a navigation is served from the cached shell so the document and its scripts always match', async () => {
  const sw = worker({ cached: { './index.html': { ok: true, body: 'cached-shell' } } });
  const { handled, promise } = sw.send(navigate('https://silo.test/'));
  assert.equal(handled, true);
  assert.equal((await promise).body, 'cached-shell', 'the cached shell must win over the network');
});

test('a first-ever navigation falls back to the network', async () => {
  const sw = worker();
  const { promise } = sw.send(navigate('https://silo.test/'));
  assert.equal((await promise).body, 'network');
});

test('a cached asset is served from the cache', async () => {
  const sw = worker({ cached: { 'https://silo.test/styles.css': { ok: true, body: 'cached-css' } } });
  const { promise } = sw.send({ method: 'GET', mode: 'cors', url: 'https://silo.test/styles.css' });
  assert.equal((await promise).body, 'cached-css');
});

test('non-GET and cross-origin requests are left to the browser', () => {
  const sw = worker();
  assert.equal(sw.send({ method: 'POST', mode: 'navigate', url: 'https://silo.test/' }).handled, false);
  assert.equal(sw.send({ method: 'GET', mode: 'cors', url: 'https://other.test/styles.css' }).handled, false);
});
