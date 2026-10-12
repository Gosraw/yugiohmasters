// Bump CACHE_VERSION whenever this file or the offline page changes;
// activate() then drops every older cache.
const CACHE_VERSION = 2;
const CACHE = `duelist-circle-v${CACHE_VERSION}`;
const OFFLINE = "/offline";

// Cache the offline page AND the stylesheets it links to, so it
// still looks like the app without a connection.
async function cacheOfflinePage() {
  const cache = await caches.open(CACHE);
  const response = await fetch(OFFLINE, { cache: "reload" });

  await cache.put(OFFLINE, response.clone());
  await cache.add("/icon.svg").catch(() => undefined);

  const html = await response.text();
  const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)]
    .map((tag) => tag[0].match(/href="([^"]+)"/)?.[1])
    .filter((href) => href && href.startsWith("/"));

  await Promise.all(styles.map((href) => cache.add(href).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheOfflinePage());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }

  // Offline page stylesheets: network first, cached copy offline.
  if (request.destination === "style") {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
    );
  }
});
