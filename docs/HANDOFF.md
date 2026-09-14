# Openframe: handoff

This file is how work continues after a pause (for example, a usage limit). Read it first, then check `git status` and `git log --oneline -15`. It is updated with every phase commit.

## How work is done

- **Scope:** an offline design editor (TypeScript, React, Vite, CanvasKit).
  - Features must follow the docs mirror in `docs-mirror/`.
  - No fake features: anything not fully working is listed as pending in `docs/FEATURE_MATRIX.md`.
- **Roadmap:** milestones M0–M15, tracked per feature in `docs/FEATURE_MATRIX.md` (the Milestone and Status columns).
- **Commit per phase**, as `slaviboy <slavi94slavi94@gmail.com>`:
  - No co-author trailers (the commit-msg hook strips them).
  - Never push.
  - Stage explicit paths only.
- **License header:** every `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs` and `.css` file starts with the Apache-2.0 header "Copyright (C) 2026 Stanislav Georgiev / https://github.com/slaviboy". The pre-commit hook checks it.
- **Gate before each commit:**
  1. Run `npm run check` (typecheck, lint, unit tests).
  2. Run the related E2E specs on Chromium: `npx playwright test <specs> --project=chromium`.
  3. Run the full `npx playwright test` in the background, logging to a file.
     - Parse the log for the `failed` count and the `flaky` list.
     - Never run other tests while the full run is going.
  4. Commit when 0 failed and any flaky tests are WebKit-only.
     - A WebKit failure that is a WASM load abort ("both async and sync fetching of the wasm failed") is infrastructure noise.
     - Rerun it on its own with `--project=webkit --retries=1`. If uncommitted work from the next phase is present, stash those paths (`git stash push -u -- <paths>`), rerun, then `git stash pop`.
- **E2E conventions** (`e2e/fixtures.ts` fails a test on any console error):
  - Draw frames at canvas x ≥ 300 (the left sidebar covers less than that).
  - Wait for each layer's tree row before the next draw.
  - Locator names match substrings: use `exact: true` or a regex.
  - Menu item names include their shortcut, for example "Save ⌘S".

## Done

- **M0–M8:** see the matrix.
- **M9 (files, import and export):**
  - Raster and SVG export
  - Copy as PNG/SVG
  - SVG import as vectors
  - .openframe save and open
  - Files browser and thumbnails
  - Version history
  - Save and Save as to disk (File System Access API)
- **M10 (prototyping), committed so far:**
  - `fc4d491` Prototype tab and interaction details: reactions schema, `src/core/prototype/reactions.ts`, `src/editor/commands/prototype.ts`, `src/ui/panels/prototype/PrototypePanel.tsx`
  - `690c728` Prototype player core: `src/core/prototype/player.ts`, a pure state machine
  - Flows and overlay settings (the commit after `690c728`):
    - `flowStartingPoints` on the page and `overlay` on layers
    - `src/core/prototype/flows.ts`, plus the flow and overlay commands in `src/editor/commands/prototype.ts` (a new connection auto-creates a flow)
    - the Flows, Flow starting point and Overlay sections in `PrototypePanel`
  - Presentation view (the commit after the flows commit):
    - `src/core/prototype/presentation.ts`
    - `src/app/present.ts`: the `?present=1&file=&page=&node=` URL
    - `src/ui/present/` (`PresentationRenderer`, `PresentationView`, `PresentApp`)
    - Present (Mod+Alt+Enter) opens it in a new tab
  - Connection noodles (the commit after presentation view):
    - `src/core/prototype/connections.ts`
    - `drawPrototypeChrome` in `overlay-renderer.ts` draws the noodles and flow tags while the Prototype tab is open
  - Drag to connect (the commit after connection noodles):
    - the + handle on the selection's right edge (`src/editor/chrome/prototype-geometry.ts`)
    - the move tool's `connect` gesture adds interactions on drop
  - Smart animate (the commit after drag to connect):
    - `src/core/prototype/smart-animate.ts` matches layers and blends them
    - presentation view renders the blended frames each tick
  - Scroll overflow (the commit after smart animate):
    - `overflowDirection` and `scrollBehavior`, and `src/core/prototype/scroll.ts`
    - the Scroll behavior section in the Prototype tab
    - presentation view scrolls frames (wheel, Scroll to, fixed and sticky layers, remembered offsets)
    - also fixed: the scene index is built before frames are drawn (earlier, presentation view showed blank frames)
  - Selecting connections (the commit after scroll overflow):
    - clicking a noodle selects its connection and opens its interaction
    - dragging selected connections changes their destination, or removes them on empty canvas
    - ⇧E toggles the Prototype tab
  - Inline preview (the commit after selecting connections):
    - ⇧Space or Preview opens `InlinePreview`, `PresentationView` with `inline`
    - it follows edits and the canvas selection, has Follow prototype, and keeps its keys while focused
  - Frame presets (the commit after inline preview, Frames row):
    - the `src/core/document/frame-presets.ts` catalog
    - the Frame tool's preset list, and the Frame preset dropdown

## In progress (uncommitted)

1. **Device and background settings.** Started, uncommitted, and builds on the committed frame presets:
   - `prototypeDevice` and `prototypeBackground` on the page (`src/core/schema/document.ts`)
   - `setPrototypeDevice` and `setPrototypeBackground` in `src/editor/commands/prototype.ts`

   Still to do:
   - `effectiveDevice`: the explicit setting, or the device preset matching the first frame's size
   - a device layout in `composeScene` (device body, screen clip, scaling the frame to the device width)
   - the renderer drawing the device body and clip
   - using the background color in `PresentationView`, with mobile devices only inline
   - a Prototype settings section in `PrototypePanel` with nothing selected (Device, Orientation, Background)
   - tests, the matrix row, the gate, commit

**Known flake to investigate:** WebKit's `e2e/presentation.spec.ts` once logged `StorageError: Browser storage is unavailable` when the presentation tab opened IndexedDB while the editor tab held it. It passed on retry.

## Next (M10, in order)

1. The overlay badge on the canvas; dragging to scroll on touch; nested sticky layers.
2. State memorization of scroll position; Animate matching layers on the moving transitions.
4. Device and background settings; the prototype settings panel with nothing selected.
5. Interactive components (Change to), connections from main components, sections as destinations.
6. Set variable, set variable mode, conditionals and expressions in actions (the evaluator exists in `src/core/prototype/expressions.ts`).
7. Video fills with video triggers and actions (M10 video row).
8. Accessible prototypes, manual overlay positions, rich-text flow descriptions, gamepad triggers.

**Stop after M10.** When every M10 row is finished and committed, stop and report to the user. Don't start M11 until the user says to continue. After that, M11–M15 follow `docs/FEATURE_MATRIX.md` (the rows marked Planned or In progress) in milestone order.
