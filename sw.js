/* Simple service worker for offline-first */
const CACHE = "np-sim-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./public/manifest.webmanifest",
  "./public/icons/icon-192.png",
  "./public/icons/icon-512.png",
  "./src/main.js",
  "./src/engine.js",
  "./src/db.js"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(r => {
      return r || fetch(e.request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return resp;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
