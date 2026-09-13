# Testing

Openframe is tested at four levels. Every milestone must pass all of them before the next one begins.

| Level | Tool | Location | What it covers |
|---|---|---|---|
| Unit | Vitest (Node) | `src/**/*.test.ts` next to the code | Math, geometry, color, easing, expressions, IDs and fractional indexing, document store, ops/history (including fast-check properties), serialization, migrations, hit testing, selection rules, commands, keymap, tools (headless pointer simulation), panel logic |
| Engine | Vitest + CanvasKit CPU surface | `src/engine/**/*.test.ts` | Deterministic pixel output of the scene renderer: background, fills, clipping, strokes, blend modes, culling, zoom |
| Persistence | Vitest + fake-indexeddb | `src/platform/**/*.test.ts` | Snapshots, journal batching, crash-recovery replay, atomic compaction, status transitions, error classification |
| End-to-end | Playwright (Chromium, Firefox, WebKit) | `e2e/*.spec.ts` | Real user workflows against the **production build** served locally |

## Running

```bash
npm test                          # all Vitest suites
npx vitest src/core               # one area, watch mode
npm run test:e2e                  # builds, serves dist/, runs all browsers
npx playwright test --project=chromium e2e/foundation.spec.ts
```

## Guards active in every E2E test

These guards live in [`e2e/fixtures.ts`](../e2e/fixtures.ts). Specs must import `test` and `expect` from `./fixtures`.

- **Network guard:** any request not addressed to the local preview origin (or a `data:`/`blob:` URL) is aborted, and the test fails. WebSocket connections are recorded as violations too.
- **Error guard:** uncaught page errors, `console.error` output, and Content-Security-Policy violations fail the test.

The error guard caught two real production-only failures that unit tests could not see:
1. CanvasKit needs `'wasm-unsafe-eval'` in the CSP.
2. zod's eval probe produces a CSP report unless zod is configured `jitless`.

### Service worker tests

- **Observe mode, not interception.** Playwright request interception (`page.route`) bypasses service workers. Specs that exercise the worker opt into `test.use({ networkGuardMode: 'observe' })`, which records off-origin requests without intercepting them. They also call `context.setOffline(true)`, so the network is physically unavailable.
- **Chromium only.** Service-worker specs are tagged `@chromium-only`; Firefox and WebKit skip them via `grepInvert`.
- **Debugging.** To debug offline failures, log `response.fromServiceWorker()` and the `Vary` and `Origin` headers for each asset. This is how the `Vary: Origin` cache-miss bug was found (see [ADR 0002](adr/0002-service-worker.md)).

## Manual checks (not automatable)

Run these before each release, in Chromium, Firefox and Safari:

1. **Cross-tab clipboard:** open two tabs of the app. Copy layers in one tab with ⌘C and paste them in the other with ⌘V. The pasted layers must be identical, and the paste must be a single undo step.
2. **Paste into another app:** paste copied layers into a plain text editor. It must show the layer names, never JSON.

## Writing tests

- **Unit tests before UI.** Behavior with rules, such as selection targeting, reordering, resize math, or undo granularity, lives in `core`/`editor` and is unit-tested headlessly. E2E tests confirm the wiring and the real browser.
- **Undo granularity is part of the contract.** Any gesture-based feature needs a test showing it produces exactly one undo step.
- **Determinism.**
  - Engine tests render through CanvasKit's CPU surface. Output must be byte-identical across runs.
  - Tests use fixed ID replicas (`new IdGenerator('t')`).
- **E2E coordinates.** Panels float over the canvas. Pointer coordinates in E2E specs must avoid the left panel (x < ~300 px at default width), the right panel, and the bottom toolbar.

## Planned additions

These are tracked in the feature matrix:
- Visual regression screenshots of the main UI states, in light and dark themes (from M2).
- Performance fixtures with 100 / 1,000 / 5,000 / 10,000 nodes and frame-time budgets (M2 onward, full pass in M15).
- An offline install E2E: service worker activated, network disabled, reload, edit, persist (with the PWA work).
- Accessibility checks with axe on every main screen.
