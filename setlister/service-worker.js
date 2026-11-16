"use strict";

const CACHE_NAME = "setlister-shell-v0.5.0";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=0.5.0",
  "/app.js?v=0.5.0",
  "/manifest.webmanifest?v=0.5.0",
  "/assets/logo.svg?v=0.5.0",
  "/assets/favicon.svg?v=0.5.0",
  "/assets/icon-192.png?v=0.5.0",
  "/assets/icon-512.png?v=0.5.0",
  "/assets/apple-touch-icon.png?v=0.5.0",
  "/assets/vendor/spreadsheet-reader.js?v=0.5.0"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match("/index.html")))
  );
});
