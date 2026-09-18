# Openframe

Openframe is an offline, local-first design editor that runs entirely in the browser. It follows the workflows of Design mode, Draw mode, Dev Mode and Motion mode. It is an independent implementation: no the reference code, assets or services are used.

- **No account, no backend, no network.** Documents live in the browser (IndexedDB) and in files you open or save.
- **Built for production quality.** Every visible control performs a real operation. Unfinished features are left out of the UI and tracked in [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md).

## Getting started

```bash
npm install
npm run dev          # development server
npm run build        # typecheck + production build (dist/)
npm run preview      # serve the production build locally
npm run build:watch  # rebuild dist/ on every change (for VS Code Live Server)
```

**VS Code Live Server:** `index.html` in the repository root is the Vite *source* entry (it loads `src/main.tsx`). Browsers can't run it directly, so opening it with Live Server or `file://` shows a blank page. Run `npm run build` (or keep `npm run build:watch` running), then click **Go Live**. [`.vscode/settings.json`](.vscode/settings.json) points Live Server at `dist/`.

The build uses relative URLs, so it works at any path: Live Server, `npm run preview`, or GitHub Pages at `/Artboard/` (see [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

Node 22+ is required. After `npm install`, no step needs internet access: fonts, the rendering engine (CanvasKit WebAssembly) and all assets are bundled.

## Scripts

| Script | Purpose |
|---|---|
| `npm run typecheck` | Strict TypeScript for core (no DOM), app, tests and tooling |
| `npm run lint` | ESLint (typescript-eslint strict, React hooks, network API ban) |
| `npm test` | Unit and integration tests (Vitest), including CanvasKit render tests in Node |
| `npm run test:e2e` | Playwright end-to-end tests on the production build in Chromium, Firefox and WebKit, with network and error guards |
| `npm run check` | Typecheck + lint + unit tests |

## Current status

| Milestone | Status |
|---|---|
| M0 Tooling and spikes | Done |
| M1 Vertical foundation | Done |
| M2 Editing breadth | Done (a few leftovers are tracked as pending in the feature matrix) |
| M3 Paint, effects, blend, masks, corners, color | In progress |
| M4–M15 | Not started |

**M1 — foundation**
- CanvasKit (Skia WebAssembly) scene rendering with viewport culling, hit testing, selection, pan and zoom.
- Versioned, validated document model with transactional undo/redo (one gesture is one undo step).
- Autosave to IndexedDB with crash-recovery journal replay.
- Pages, virtualized layers tree, design inspector, command registry and keyboard shortcuts.
- Offline and installable: a service worker precaches the app, fonts and rendering engine.

**M2 — editing breadth**
- Tools: Move, Hand, Scale, Frame, Section, Slice, Rectangle, Line, Arrow, Ellipse, Polygon, Star.
- Group, frame selection, ungroup, duplicate, flip, rotation, clipboard, snapping and smart guides, align and distribute, tidy up, smart selection spacing.
- Rulers and guides, outline mode, pixel grid, Find, batch rename, select matching, measurements, command palette, main and context menus, keyboard shortcuts panel.

**M3 — done so far**
- Color picker, gradients (linear, radial, angular, diamond) with on-canvas handles, layer and paint blend modes, selection colors, eyedropper (I).
- Strokes: dashes, caps, joins, miter angle, per-side weights. Corner radius with independent corners, including polygons and stars.
- Effects: drop and inner shadows with blend modes, layer blur, background blur.
- Image fills: place image (⇧⌘K), drop and paste, fill / fit / crop / tile, rotation, adjustments, on-canvas crop tool.
- Masks (alpha, vector, luminance) with mask outlines. Copy and paste properties.

**M3 — remaining:** progressive blur, noise, texture, glass, effect limits and ordering, contrast checker, pattern fills, Display P3.

The full roadmap is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#roadmap). Per-feature status, including features that cannot work offline, is in [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Document format](docs/DOCUMENT_FORMAT.md)
- [Generating `.openframe` files (guide for an AI)](docs/AI_FILE_GENERATION.md)
- [Editor: commands, transactions, tools](docs/EDITOR.md)
- [Fonts: the Google Fonts library](docs/FONTS.md)
- [Icons: Material Symbols](docs/ICONS.md)
- [Testing](docs/TESTING.md)
- [Feature matrix](docs/FEATURE_MATRIX.md)
- Decision records: [docs/adr](docs/adr)

## Offline and privacy guarantees

- **CSP.** A Content-Security-Policy restricts scripts, connections, fonts and images to the app's own origin. `'wasm-unsafe-eval'` is the only relaxation, and it permits compiling the bundled WebAssembly engine.
- **Lint.** ESLint forbids `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `navigator.sendBeacon` in application code.
- **Tests.** Every E2E test fails if the page requests anything outside the local server, logs an error, or triggers a CSP violation.
