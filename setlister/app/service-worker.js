"use strict";
const CACHE_NAME = "setlister-app-v0.14.0";
const SHELL = ["/", "/styles.css?v=0.14.0", "/planning.js?v=0.14.0", "/app.js?v=0.14.0", "/legacy-import.js?v=0.14.0", "/brand/logo-mark.svg", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/venue-catalog.json"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("setlister-app-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin
      || url.searchParams.has("reset") || url.searchParams.has("invite")
      || url.pathname.startsWith("/api/") || url.pathname.startsWith("/calendar/feed/")) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match("/"))));
});
