# ADR 0002: Hand-written service worker with a build-time precache manifest

- Status: Accepted (2026-09-13)
- Code:
  - [`src/pwa/sw.ts`](../../src/pwa/sw.ts)
  - [`scripts/vite-plugin-sw.ts`](../../scripts/vite-plugin-sw.ts)
  - [`src/platform/sw-register.ts`](../../src/platform/sw-register.ts)
- Test: [`e2e/offline.spec.ts`](../../e2e/offline.spec.ts)

## Context

After the first visit, the installed app must start, edit and persist with no network. The assets it has to serve include:
- the JS bundle and CSS
- the bundled Inter font files
- the 8.2 MB CanvasKit wasm
- the web manifest and the icons

The service worker must never swap the running build out from under an editing session.

## Decision

**No Workbox.** The worker is under 100 lines and fully typed. It is built from `src/pwa/sw.ts` with its own `tsconfig.sw.json`, which uses the WebWorker lib and no DOM. A library would add a dependency and configuration surface without adding capability.

**Precache manifest injected at build time.** A small Vite plugin does three things:
1. Emits the worker as `/sw.js`.
2. In `generateBundle`, replaces the placeholders with two lists:
   - the install precache: every emitted file plus the app shell, manifest and icons, except deferred assets;
   - the deferred list: large lazily loaded assets, currently the color emoji font chunk (`emoji-font-data-*.js`, 7.6 MB).

   The 454 Noto Sans SC/TC/JP/KR subset chunks (`noto-sans-<script>-<n>-wght-normal-*.js`, 23.3 MB in total) are in neither list. The cache-first fetch handler caches each one the first time text needs it, so a script is available offline once it has been used online. Pre-caching all of them after startup made WebKit fail page reloads far more often in the E2E suite (10 reload failures in one run instead of 1–2), and most users never need most of them.
3. Stamps a version derived from the content hash of both lists and the code.

Deferred assets are cached after the app has started. Once the canvas is ready, the page calls `precacheDeferredAssets()`, which posts `PRECACHE_DEFERRED`. The worker then adds each missing deferred file to the current cache, one at a time; a failure is retried on the next start, and the normal cache-first fetch also caches the file when first used. This keeps the first install from downloading the 7.6 MB emoji chunk alongside the 8.2 MB CanvasKit wasm, while the app still works offline after one online start.

The plugin fails the build if the placeholders are missing, so a misconfigured worker can never ship silently.

**Fetch strategies**

| Request | Strategy |
|---|---|
| Navigations | Cached `/index.html` (app shell), then `/`, then the network |
| Same-origin GET | Cache first, falling back to the network; successful same-origin responses are added to the cache |
| Cross-origin | Not handled. The app makes no cross-origin requests; CSP and the E2E guards enforce this. |

**Updates wait for the user.**
- A new worker installs in the background and stays waiting.
- The UI shows "A new version is ready · Reload".
- On Reload, the app flushes autosave, posts `SKIP_WAITING`, and reloads once the new worker takes control.
- Activation deletes old `openframe-*` caches.

**Registration only in production builds.** The dev server never registers a worker.

## Root cause found while testing: `Vary: Origin`

The first offline E2E run failed. The document came from the service worker, but the JS and CSS requests failed with `ERR_FAILED` even though both were in the cache.

A diagnostic run showed why:
- The preview server sends `Vary: Origin` on every response.
- Vite marks the built module script and stylesheet `crossorigin`, so the page requests them with `Origin: http://localhost:4173`. Fonts loaded from that CSS behave the same way.
- The precache requests made inside the worker carried no `Origin` header.
- The Cache API honors `Vary` by default, so `cache.match()` missed. The worker then fell back to the network, which was offline.

The fix is `cache.match(request, { ignoreVary: true, … })` for both the navigation fallback and asset lookups. This is correct for this cache:
- Its entries are immutable, content-hashed build outputs.
- Each is stored as a single decoded response whose bytes don't depend on the request's `Origin` or encoding.

After the fix, the same diagnostic showed the document, CSS, JS, font and wasm all served with `fromServiceWorker() === true` while offline, and the editor shell rendered.

## Testing notes

Playwright request interception (`page.route`) bypasses service workers. The offline spec therefore does two things:
- Runs the network guard in `observe` mode, which records off-origin requests without intercepting them.
- Enables `context.setOffline(true)`, which physically blocks the network.

Every other spec keeps the intercept-and-abort mode.

## Consequences

- The first visit downloads about 8.5 MB once. Later starts need no network.
- A new deployment never interrupts an open session. Users apply it explicitly, after autosave has flushed.
- Service-worker behavior is verified only in Chromium under Playwright. Firefox and WebKit run the rest of the suite without a worker.
