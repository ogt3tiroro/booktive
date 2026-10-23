// アプリ本体をキャッシュしてオフラインでも回答を見直せるようにする
const CACHE = "mensetsu-v1";
const SHELL = ["./", "index.html", "css/style.css", "js/app.js", "js/claude.js", "vendor/anthropic-sdk.js", "manifest.json", "icons/icon.svg"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // 自サイトのファイルはネット優先、つながらなければキャッシュ
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
