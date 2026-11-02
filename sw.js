// Keeps a copy of the garden on the device so it opens without a connection.
// The page itself is fetched fresh whenever possible (so updates show at once) and falls back to the copy;
// everything else (song, icons, fonts, the database library) is served from the copy and refreshed behind it.
// Live data (stars, presence) never goes through here.
const CACHE = 'nightshade-v1';
const CORE = ['./', 'index.html', 'musicbox.mid', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.hostname.endsWith('supabase.co')) return;

  if (req.mode === 'navigate') {
    // the page: network first, the saved copy when offline
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put('index.html', copy));
      return res;
    }).catch(() => caches.match('index.html').then(r => r || caches.match('./'))));
    return;
  }

  // everything else: the saved copy straight away, refreshed in the background
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: url.origin === location.origin });
    const fresh = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || fresh;
  }));
});
