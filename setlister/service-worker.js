"use strict";

const CACHE_NAME = "setlister-public-v0.6.0";
const APP_SHELL = [
  "/", "/index.html", "/mvp.css?v=0.6.0", "/mvp.js?v=0.6.0",
  "/manifest.webmanifest?v=0.6.0", "/mvp-icon.svg", "/mvp-icon-192.png", "/mvp-icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("setlister-public-") && key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/propadleek")) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match("/index.html"))));
});
