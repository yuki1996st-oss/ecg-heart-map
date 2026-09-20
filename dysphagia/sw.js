/* ============================================================
   sw.js（サービスワーカー）
   一度開いたあとは、電波が届かない場所でもアプリを開けるようにします。
   ファイルを更新したら、下の CACHE_NAME の数字を1つ増やしてください。
   （増やさないと、古い画面が表示され続けることがあります）
   ============================================================ */
const CACHE_NAME = "dysphagia-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./data.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* まずネットワークを試し、つながらなければキャッシュを使います */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match("./index.html")))
  );
});
