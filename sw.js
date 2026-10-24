// 剧本杀小助手 · Service Worker（由 build.mjs 生成）
const CACHE = 'jbs-1.0.0-175452fc17';
const ASSETS = ['./', './manifest.webmanifest', './icon.svg', './icon-maskable.svg'];
const SCOPE = self.registration.scope;
const SHELL = new Set([SCOPE, SCOPE + 'index.html']);
const STATIC = new Set(ASSETS.slice(1).map((a) => new URL(a, SCOPE).href));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('jbs-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// 先用缓存秒开，同时在后台更新；断网时直接用缓存
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const href = req.url.split('#')[0].split('?')[0];
  const shell = SHELL.has(href);
  if (!shell && !STATIC.has(href)) return;
  const key = shell ? SCOPE : href;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(key);
    const net = fetch(req).then(async (res) => {
      if (res.ok && !res.redirected) await cache.put(key, res.clone());
      return res;
    });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  })());
});
