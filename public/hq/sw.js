/* Wedding HQ service worker. Scope: /hq/ only (registered from inside the HQ
   app, never from the main Capture by Val app).

   It caches ONLY the app shell so HQ opens offline:
     - same-origin GET /static/* (hashed JS/CSS/media) and a few fixed icons
     - the HTML page for navigations under /hq/ (network first, cached fallback)
   It NEVER caches Supabase / API / storage responses, signed URLs, or anything
   cross-origin; those requests are not intercepted at all. Personal data is
   kept separately by the app (localStorage), not here.

   Bump VERSION whenever this file changes in a way that needs old caches gone. */
'use strict';

var VERSION = 'v1';
var CACHE_PREFIX = 'wedding-hq-shell-';
var CACHE_NAME = CACHE_PREFIX + VERSION;
var SHELL_URL = '/index.html';
var MAX_ENTRIES = 120;
var ASSET_ALLOWLIST = ['/valere_logo.png', '/hq/icon-192.png', '/hq/icon-512.png', '/hq/apple-touch-icon.png'];

function parse(url) {
  try {
    return new URL(url, self.location.href);
  } catch (e) {
    return null;
  }
}

// A cacheable static asset: same origin, GET, under /static/ or on the allowlist.
function isStaticAsset(url, method) {
  var u = parse(url);
  if (!u || method !== 'GET' || u.origin !== self.location.origin) return false;
  if (u.search && u.pathname.indexOf('/static/') !== 0) return false;
  return u.pathname.indexOf('/static/') === 0 || ASSET_ALLOWLIST.indexOf(u.pathname) !== -1;
}

// An HTML navigation inside the HQ scope. Never /hq/sw.js or other files.
function isHqNavigation(url, method, mode) {
  var u = parse(url);
  if (!u || method !== 'GET' || mode !== 'navigate' || u.origin !== self.location.origin) return false;
  var p = u.pathname;
  if (p !== '/hq/' && p.indexOf('/hq/') !== 0) return false;
  return !/\.[a-z0-9]+$/i.test(p);
}

self.__hqSwRules = { isStaticAsset: isStaticAsset, isHqNavigation: isHqNavigation, CACHE_NAME: CACHE_NAME };

function trim(cache) {
  return cache.keys().then(function (keys) {
    var extra = keys.length - MAX_ENTRIES;
    return Promise.all(keys.slice(0, Math.max(0, extra)).map(function (k) { return cache.delete(k); }));
  });
}

function putIfOk(cache, request, response) {
  if (!response || !response.ok || response.type === 'opaque') return Promise.resolve();
  return cache.put(request, response).then(function () { return trim(cache); });
}

self.addEventListener('install', function (event) {
  // No skipWaiting here: a new version waits until the page asks for it, so
  // the user chooses when to reload ("Update available").
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return fetch(SHELL_URL, { cache: 'reload' }).then(function (res) { return putIfOk(cache, SHELL_URL, res); });
    }).catch(function () { /* offline install: shell is cached on first online navigation */ })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names
        .filter(function (n) { return n.indexOf(CACHE_PREFIX) === 0 && n !== CACHE_NAME; })
        .map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)) {
    // The page lists the assets it already loaded (they predate this worker).
    var urls = data.urls.filter(function (u) { return typeof u === 'string' && isStaticAsset(u, 'GET'); });
    event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(urls.map(function (u) {
        return cache.match(u).then(function (hit) {
          if (hit) return undefined;
          return fetch(u).then(function (res) { return putIfOk(cache, u, res); }).catch(function () {});
        });
      }));
    }));
  }
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (isHqNavigation(req.url, req.method, req.mode)) {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        var type = res.headers && res.headers.get('content-type');
        if (res.ok && type && type.indexOf('text/html') !== -1) {
          caches.open(CACHE_NAME).then(function (c) { return putIfOk(c, SHELL_URL, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        return caches.open(CACHE_NAME).then(function (c) { return c.match(SHELL_URL); }).then(function (hit) {
          return hit || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
        });
      })
    );
    return;
  }
  if (isStaticAsset(req.url, req.method)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            var copy = res.clone();
            putIfOk(cache, req, copy).catch(function () {});
            return res;
          });
        });
      })
    );
  }
  // Everything else (Supabase, storage, signed URLs, cross-origin, non-GET):
  // not intercepted, so the browser handles it normally and nothing is stored.
});
