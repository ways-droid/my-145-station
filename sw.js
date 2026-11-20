/* my-145-station : ouverture de l'application sans réseau (HTTPS uniquement).
   Réseau d'abord pour la page et les scripts (toujours la dernière version), copie gardée pour le jour où il n'y a pas de réseau.
   Les données (api/) ne passent pas par ici : elles ont leur propre copie locale et leur file d'attente (client/ways-api.js). */
const CACHE = "my145-shell-v1";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "index.html"]).catch(() => {}))); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || /\/api\//.test(u.pathname)) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || (e.request.mode === "navigate" ? caches.match("index.html") : undefined)).then(r => r || Response.error())));
});
