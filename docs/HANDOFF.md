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

## In progress (uncommitted)

1. **Presentation view.** Written but not yet typechecked or tested:
   - `src/core/prototype/presentation.ts` and `presentation.test.ts`: scaling, transition offsets, scene composition, hit mapping
   - `src/app/present.ts`: the `?present=1&file=&page=&node=` URL, a read-only session, and `presentFile`, which opens a new tab
   - `src/ui/present/`: `PresentationRenderer` (cached frame images), `PresentationView` (input, timers, keys, flows sidebar, options, footer) and `PresentApp`
   - `src/main.tsx`: routes to `PresentApp` when the URL has `?present`
   - `src/ui/App.tsx`: the `view.present` command (Mod+Alt+Enter)
   - `src/ui/shell/EditorShell.tsx`: the Present button in the right header
   - `e2e/presentation.spec.ts`

   Next steps:
   - Run `npm run check` and fix errors.
   - Run `npx playwright test e2e/presentation.spec.ts --project=chromium`.
   - Update the matrix rows (Presentation view, Present offline in M9, Transitions, Triggers, Actions).
   - Run the full E2E gate, then commit.

## Next (M10, in order)

1. Connection noodles on the canvas and dragging + to a destination; the flow starting point and overlay badges on the canvas.
2. Smart animate: interpolate matching layers by name and hierarchy (currently it dissolves).
3. Scroll overflow (horizontal, vertical, both), fixed and sticky layers, and state memorization of scroll position.
4. Inline preview (⇧Space) and follow prototype.
5. Device and background settings; the prototype settings panel with nothing selected.
6. Interactive components (Change to), connections from main components, sections as destinations.
7. Set variable, set variable mode, conditionals and expressions in actions (the evaluator exists in `src/core/prototype/expressions.ts`).
8. Video fills with video triggers and actions (M10 video row).
9. View prototype connections, accessible prototypes, manual overlay positions, rich-text flow descriptions, gamepad triggers.

After M10, continue with M11–M15 per `docs/FEATURE_MATRIX.md`: the rows marked Planned or In progress, in milestone order.
