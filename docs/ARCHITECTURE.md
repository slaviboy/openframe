# Openframe Architecture

Openframe is an offline, local-first browser design editor. Its workflows follow Design mode, Draw mode, Dev Mode and Motion mode. There is no backend: every byte of state lives in the browser (IndexedDB/OPFS) or in files the user opens and saves.

This document gives the big picture. Detailed specs:
- [DOCUMENT_FORMAT.md](DOCUMENT_FORMAT.md): schema, IDs, ordering, serialization, migrations
- [RENDERING.md](RENDERING.md): the CanvasKit pipeline, caching, hit testing
- [EDITOR.md](EDITOR.md): commands, transactions, tools, keymap
- [PROTOTYPING.md](PROTOTYPING.md): prototype runtime and the shared animation core
- [PERFORMANCE.md](PERFORMANCE.md), [TESTING.md](TESTING.md)
- Decision records live in [adr/](adr/).

## Guiding rules

1. **The document model is the source of truth.** React renders it; React state never holds document data.
2. **Every mutation is an op inside a transaction.** Ops have exact inverses. One user gesture is one undo step.
3. **Layers only depend downward.** `core ← engine ← editor ← ui ← app`. `platform` implements the editor's ports and is wired in by `app`.
4. **No network.** ESLint bans network globals, CSP sets `connect-src 'self'`, and Playwright aborts any off-origin request and fails the test.
5. **No dead UI.** A control is only rendered once its whole chain works. Unfinished features are absent from the UI and marked in [FEATURE_MATRIX.md](FEATURE_MATRIX.md).

## Layers

```
src/
  core/      Pure TypeScript. No DOM, React, CanvasKit or IO (typechecked without DOM libs).
    math/        vectors, affine matrices, rects, cubic Béziers, spatial index
    color/       color models, contrast
    ids/         replica:counter IDs, fractional-index sibling keys
    schema/      zod schemas → types + boundary validation, format version
    props/       property registry (dirty category, animatable, bindable, overridable, inspector meta)
    document/    DocumentStore (entity maps, tree index, queries)
    ops/         set / splice / create / delete ops, invert, coalesce, ChangeSet
    history/     Transaction, HistoryStack
    migrations/  forward-only JSON migrations per format version
    serialize/   canonical JSON, package layout
    resolve/     instances + overrides, styles, variables/modes/aliases, motion sampling
    layout/      auto layout (flex + grid), constraints, text-measure interface
    vector/      vector networks, planarization, faces
    anim/        easing (bezier/spring/hold), interpolation, timelines, smart-animate matching
    prototype/   interaction model, expression language, runtime reducer
    codegen/     CSS / SwiftUI / UIKit / Compose / Android XML, animation handoff
    diff/        property diff, 3-way merge, compare changes
  engine/    core + CanvasKit + DOM, no React.
    ck/          loader, disposal ownership, surfaces, context-loss recovery
    text/        font registry, paragraph cache, TextMeasurer implementation
    geometry/    booleans, outline stroke, offset, simplify, variable width, brushes
    render/      SceneRenderer, display-list and tile caches, effects (SkSL), masks
    hittest/     precise hit tests over the spatial index
    import/      SVG and raster import
    export/      raster, SVG, PDF, GIF/video encoders
  editor/    core + engine, no React. The application logic.
    stores/      EditorStore (selection, tool, mode, viewport, hover), PlayerStore
    commands/    command registry (one source for menus, palette, shortcuts, tests)
    keymap/      contexts, chords, user overrides
    tools/       one state machine per tool
    interactions/ drag/resize/rotate controllers, snapping, alignment
    chrome/      Canvas 2D overlay: selection, handles, guides, redlines, rulers
    text-edit/   hidden-textarea text editing controller
    motion/ dev/ clipboard/
    ports.ts     Persistence, FileAccess, FontAccess, Clock interfaces
  platform/  IndexedDB, OPFS, File System Access, Web Locks, service worker registration
  workers/   serialize, image, export workers (core + engine only)
  ui/        React: tokens, icons, primitives, shell, panels, canvas host, timeline, presentation
  app/       bootstrap and dependency wiring
```

## Data flow of an edit

```
pointer/keyboard event
  → tool state machine or command            (editor)
  → Transaction: tx.set / create / delete     (core/history; applied live for preview)
  → commit
      → finalizers: layout, constraints       (core/layout)
      → invariants (dev builds)
      → HistoryEntry {ops, selection before/after}
      → ChangeSet {node → dirty categories}
  → subscribers
      → resolve caches invalidate by dependency
      → spatial index updates changed bounds
      → renderer invalidates old ∪ new bounds (tiles/display lists)
      → UI selectors re-run only when their inputs changed
      → persistence journal appends ops (flushed ≤250 ms)
```

Undo applies the inverse ops of the last entry and restores `selectionBefore`. Redo re-applies the ops.

## Rendering

Decision: [ADR 0001](adr/0001-renderer-canvaskit.md).

- **Scene:** CanvasKit (Skia WASM, full build) on a WebGL2 canvas.
  - A per-node display list (`SkPicture`) sits under tiles at quantized zoom levels.
  - While a selection is dragged, it renders live on a "lift layer" above cached tiles.
  - Hierarchical culling via cached subtree bounds; level of detail for sub-pixel content.
- **Chrome:** a Canvas 2D overlay canvas, redrawn every pointer frame without touching the scene.
- **Hit testing:** spatial index (packed Hilbert R-tree, rebuilt lazily per page) narrows candidates, then precise tests run against the actual geometry.
- **Exports** render in a worker with its own CanvasKit instance.

## Document model summary

Details in [DOCUMENT_FORMAT.md](DOCUMENT_FORMAT.md).

- **Flat maps.** The document holds `nodes` (plus, in later versions, styles, variables, collections and annotation categories) as maps keyed by id.
- **Tree structure.** Each node stores `parent {id, key}`; `key` is a fractional index, so reordering is a single field write. A tree index keeps sorted child lists.
- **Transforms and sizes.** Each node has a parent-relative affine transform and a size.
- **Instances.** Instance subtrees are resolved virtually from their main component. Overrides are keyed by the path of main-component node ids.
- **Property registry.** It describes every addressable property path. It drives dirty tracking, variable binding, override tracking, Motion keyframes, inspector metadata, diffing and codegen.

## State separation

| State | Lives in | Persisted | Undoable |
|---|---|---|---|
| Document | `core/document` DocumentStore | yes (journal + snapshots + files) | yes |
| Editor (selection, tool, mode, viewport per page, hover, panels) | `editor/stores` | viewport per page and panel sizes only | selection is restored with undo, but is not itself an entry |
| History | `core/history` HistoryStack | no (session) | — |
| Prototype runtime | `editor/stores/PlayerStore` | no | no |
| Local collaboration data (comments, versions, branches) | platform sidecar stores | yes | no (separate actions) |

## Persistence

- **IndexedDB stores:** `files`, `snapshots`, `journal`, `versions`, `comments`, `settings`, `blobIndex`.
- **OPFS** holds binary blobs (images, uploaded fonts), content-addressed by SHA-256.
- **Autosave:** committed ops are appended to the journal every 250 ms and on `pagehide`. They are compacted into a snapshot after 500 ops or 60 s idle.
- **Recovery:** on startup, load the latest snapshot and replay the journal.
- **Multiple tabs:** Web Locks give one writer per file; other tabs open read-only.
- **Files:** the File System Access API provides Open / Save / Save As where available. Other browsers fall back to a file input and a download.

## Workers

| Worker | Responsibility |
|---|---|
| serialize | parse, validate and migrate on load; canonical write and zip; snapshot compaction |
| image | decode, hash, mip generation, OPFS writes |
| export | render and encode PNG/JPEG/WebP/SVG/PDF/GIF/video |

Geometry ops (booleans, outlining) stay on the main thread: they take milliseconds and are cached per node revision.

## Roadmap

Milestones run sequentially. Each must pass typecheck, lint, unit, engine and E2E tests before the next starts.

| M | Scope |
|---|---|
| M0 | Tooling, CSP / network guard, renderer spike (done: ADR 0001) |
| M1 | Vertical foundation: document v1, ops/history, persistence and recovery, CanvasKit scene, culling, hit testing, move/hand/frame/rectangle/ellipse tools, shell, virtualized layers, basic inspector, reload E2E |
| M2 | Editing breadth: remaining shapes, sections, slices, grouping, clipboard, rotation/flip/scale, snapping, align/distribute, rulers/guides, zoom menu, outline mode, find, command palette, main menu, shortcuts |
| M3 | Fills (gradients, image, pattern), strokes, effects, blend modes, masks, corners, color picker |
| M4 | Text engine |
| M5 | Auto layout, constraints, layout guides |
| M6 | Vector networks, vector edit tools, booleans and path operations |
| M7 | Components, variants, component properties, slots, assets panel |
| M8 | Styles and variables |
| M9 | Files, import/export, version history, PWA |
| M10 | Prototyping and presentation |
| M11 | Draw mode |
| M12 | Motion mode |
| M13 | Dev Mode |
| M14 | Comments, branches, local libraries |
| M15 | Performance, accessibility, final feature and UI audits |
