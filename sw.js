const CACHE_NAME = 'silo-v17-atomic-shell';
const APP_SHELL = ['./', './index.html', './styles.css', './app.js', './logic.js', './storage.js', './manifest.json', './icons/icon-192.svg', './icons/icon-512.svg', './icons/apple-touch-icon.png'];

self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' }))))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('silo-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self['skipWaiting'](); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url); if (url.origin !== self.location.origin) return;
  // Everything, navigations included, is served from the one cache generation that install()
  // populated. Serving the document from the network while its scripts came from the cache is what
  // paired a new index.html with a stale app.js and bricked the app. A new generation only ever
  // arrives through install(), so nothing is revalidated in the background.
  const key = event.request.mode === 'navigate' ? './index.html' : event.request;
  event.respondWith(caches.match(key).then(cached => cached || fetch(event.request).then(response => { if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(key, response.clone())); return response; })));
});
