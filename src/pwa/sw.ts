/// <reference lib="webworker" />
/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Openframe service worker: makes the installed app start and run with no network.
 *
 * - Precaches every build output (app shell, JS, CSS, fonts, CanvasKit wasm) at install.
 * - Serves same-origin GET requests cache-first; navigations fall back to the cached shell.
 * - Never touches cross-origin requests (the app makes none).
 * - Updates wait until the page asks to activate them, so an open editing session is never
 *   swapped to a new build mid-edit.
 */
// Module scope lets `self` be re-typed as the service worker global without clashing with
// the WebWorker lib's global `self` declaration. The bundler strips this empty export.
export {};
declare const self: ServiceWorkerGlobalScope;

// Replaced at build time by the openframe-sw Vite plugin.
const PRECACHE: readonly string[] = JSON.parse('__OPENFRAME_PRECACHE__');
/** Cached after the app has started (see the PRECACHE_DEFERRED message). */
const DEFERRED: readonly string[] = JSON.parse('__OPENFRAME_DEFERRED__');
const VERSION = '__OPENFRAME_VERSION__';
const CACHE = `openframe-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.map((path) => new Request(new URL(path, self.registration.scope), { cache: 'reload' })));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('openframe-') && key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const type = (event.data as { type?: string } | null)?.type;
  if (type === 'SKIP_WAITING') void self.skipWaiting();
  // Sent by the page once the app has started: cache the large lazily loaded assets, one at a time.
  if (type === 'PRECACHE_DEFERRED') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        for (const path of DEFERRED) {
          const request = new Request(new URL(path, self.registration.scope));
          if (await cache.match(request, { ignoreVary: true })) continue;
          try {
            await cache.add(request);
          } catch {
            // Retried on the next start; until then the asset is fetched and cached when first used.
          }
        }
      })(),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // `ignoreVary`: built assets are immutable (content-hashed) and stored fully decoded, but a
  // server may send `Vary: Origin` / `Accept-Encoding`. Vite marks module scripts and styles
  // `crossorigin`, so the page requests them with an Origin header that the precache request
  // did not have; honoring Vary would then miss the cache and fail offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const scope = self.registration.scope;
        return (
          (await cache.match(new URL('index.html', scope).href, { ignoreVary: true })) ?? (await cache.match(scope, { ignoreVary: true })) ?? fetch(request)
        );
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const assets = new URL('assets/', self.registration.scope).pathname;
      const cached = await cache.match(request, { ignoreVary: true, ignoreSearch: url.pathname.startsWith(assets) });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    })(),
  );
});
