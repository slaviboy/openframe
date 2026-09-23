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
| `npm run fonts:fetch` | Downloads the Google Fonts library into `public/fonts/google/` (the only script that needs a network; the library is committed, so it is rarely run) |
| `npm run fonts:previews` | Rebuilds `previews.json`, the one file per family the font picker draws its name in — offline, from the library already on disk |

## Current status

All 15 feature areas are built. [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md) tracks them row by row —
214 rows, of which 7 cannot work offline (they need cloud, accounts or AI; each names the local
equivalent that stands in for it) and 2 depend on what the browser provides. A row reaches `Implemented`
only when the whole chain works: UI → command → document mutation → history → persistence → renderer →
reload restores state.

| Milestone | What it covers |
|---|---|
| M0 Tooling and spikes | CSP and network guard, renderer spike ([ADR 0001](docs/adr)) |
| M1 Vertical foundation | Document model, ops and history, persistence and recovery, CanvasKit scene, culling, hit testing, first tools, shell, layers tree, inspector |
| M2 Editing breadth | Every shape, sections and slices, grouping, clipboard, rotate/flip/scale, snapping and smart guides, align and distribute, rulers and guides, outline mode, find, command palette, menus, shortcuts |
| M3 Paint and effects | Gradients, image and pattern fills, strokes, shadows, blurs (including progressive), noise, texture, glass, blend modes, masks, corner radius and smoothing, colour picker, eyedropper, contrast checker, Display P3 |
| M4 Text engine | SkParagraph shaping, mixed styles, paragraphs and lists, links, OpenType features, variable axes, RTL, CJK, emoji, spell check, the font picker and the bundled Google Fonts library |
| M5 Auto layout | Constraints, layout guides, flow and grid layout, sizing, on-canvas padding and gap handles, reorder by drag |
| M6 Vector | Vector networks, pen and pencil, vector edit mode, booleans, flatten, outline stroke, brushes and width profiles |
| M7 Components | Main components, instances, variants, component properties, slots, the assets panel |
| M8 Styles and variables | Paint/text/effect/grid styles, variables with modes and bindings |
| M9 Files and export | Raster and SVG export, SVG import, `.openframe` save and open, the files browser, version history, PWA |
| M10 Prototyping | Interactions, flows, overlays, smart animate, scrolling, presentation and inline preview, variables in prototypes, video and GIF |
| M11 Draw mode | The mode switcher and Draw's own toolbar and tools |
| M12 Motion mode | Timeline and keyframes, easing, motion paths, presets, path trim, animated instances |
| M13 Dev Mode | The inspect panel, generated code, annotations, measurements, the playground |
| M14 Collaboration equivalents | The local stand-ins: branches, local libraries, comments |
| M15 Audits | Performance, accessibility, and the final feature and UI audits — **in progress** |

**What is being worked on now** is the visual fidelity pass: the UI was built from the documentation's
prose, so it works without necessarily *looking* like the reference. The matrix's **Fid** column says which
rows have been held against a saved reference page, [docs/UI_REFERENCE.md](docs/UI_REFERENCE.md) records
every measurement, and the Dev Mode inspect panel is being rebuilt against its captures.

The full roadmap is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#roadmap). Per-feature status, including features that cannot work offline, is in [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Document format](docs/DOCUMENT_FORMAT.md)
- [Generating `.openframe` files (guide for an AI)](docs/AI_FILE_GENERATION.md)
- [Editor: commands, transactions, tools](docs/EDITOR.md)
- [Rendering: the CanvasKit scene, text shaping and the fallback chain](docs/RENDERING.md)
- [Prototyping: the player, flows and presentation](docs/PROTOTYPING.md)
- [Fonts: the Google Fonts library, the fallbacks and the picker](docs/FONTS.md)
- [Icons: Material Symbols](docs/ICONS.md)
- [Performance: what was measured, and how](docs/PERFORMANCE.md)
- [UI reference: what has been held against a real page of the reference](docs/UI_REFERENCE.md)
- [Testing](docs/TESTING.md)
- [Feature matrix](docs/FEATURE_MATRIX.md)
- [Handoff: how work continues after a pause](docs/HANDOFF.md)
- Decision records: [docs/adr](docs/adr)

## Offline and privacy guarantees

- **CSP.** A Content-Security-Policy restricts scripts, connections, fonts and images to the app's own origin. `'wasm-unsafe-eval'` is the only relaxation, and it permits compiling the bundled WebAssembly engine.
- **Lint.** ESLint forbids `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `navigator.sendBeacon` in application code.
- **Tests.** Every E2E test fails if the page requests anything outside the local server, logs an error, or triggers a CSP violation.
