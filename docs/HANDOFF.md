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
  - Device and background settings (the commit after frame presets):
    - `prototypeDevice` and `prototypeBackground` on the page, and `src/core/prototype/device.ts`
    - the Prototype settings section
    - presentation view plays inside the device, drawn with its own body
  - Interactive components (the commit after device settings):
    - the `CHANGE_TO` action between variants, which instances inherit
    - presentation view switches instances in a runtime copy (`src/editor/prototype-runtime.ts`)
    - drag to connect onto variants
  - The WebKit storage flake fix (the commit after interactive components):
    - timed autosave flushes catch their errors and retry when storage is briefly unavailable
    - the lastPageId write is best effort
    - the presentation tab retries opening storage
  - Variables in prototypes (the commit after the storage fix):
    - Set variable, Set variable mode and Conditional with expressions (`src/core/prototype/variables-runtime.ts`)
    - `buildRuntime` applies them to a copy so bound layers follow
    - the Prototype tab fields
  - Connections from main components and sections as destinations (the commit after variables):
    - inherited connections are drawn only while their instance is selected (`isInheritedInteraction` in connections.ts)
    - frames in sections are top-level frames and screens
    - a section destination plays the frame of it visited last (`sectionVisits` in PlayerState)
  - Touch scrolling, nested sticky layers and the Fixed label (the commit after sections):
    - `scrollBy` in PresentationView serves wheel and touch drags
    - `stuckInParent` in scroll.ts keeps nested sticky layers within their parent
    - the overlay "badge" was dropped: the docs mirror doesn't describe one

  - Shared scroll position and Animate matching layers (the commit after touch scrolling):
    - matching frames share scroll position (`sharedScrollOffsets` in scroll.ts)
    - matching layers animate on moving transitions (`matchedLayersStore` / `withoutMatchingLayersStore` in smart-animate.ts, and `without` / `matched` frame items)

  - Video fills (the commit after shared scroll):
    - `VIDEO` paints hold `videoHash` and a poster `imageHash` in the image store (`src/ui/images/import-video.ts`)
    - the canvas draws the poster; `VideoSettings` previews the video in the Fill section
    - the E2E fixtures are `e2e/media/clip.webm` and `clip.mp4`, made with ffmpeg; all three browsers decode both

  - Video playback (the commit after video fills):
    - `PresentationRenderer.syncVideos` plays the video fills of the frames shown in hidden `<video>` elements
    - `SceneRenderer`'s `videoFrame` render option draws their current frames
    - the Prototype tab's Video section (`setVideoOptions` in `src/editor/commands/video.ts`)
    - the stage shows `data-videos` for tests

  - Video triggers and actions (the commit after video playback):
    - `ON_MEDIA_HIT` / `ON_MEDIA_END` triggers and `UPDATE_MEDIA_RUNTIME` actions
    - `resetVideoPosition` on navigation actions
    - `mediaReactions` in player.ts
    - `controlVideo` / `resetVideos` / `onVideoTime` in presentation-renderer.ts

  - Animated GIFs (the commit after video triggers and actions):
    - `gifFor` / `gifImage` in presentation-renderer.ts play GIFs with CanvasKit's `AnimatedImage`
    - they are drawn through `SceneRenderer`'s `imageFrame` option
    - `useImageMime` labels GIFs in the Fill section and the Layers panel

  - Formatted flow descriptions (the commit after animated GIFs):
    - `src/core/prototype/description.ts` parses and formats the light markup
    - `FlowDescription` (src/ui/present) renders it
    - `DescriptionEditor` in PrototypePanel.tsx is the Description panel

  - Manual overlay positions (the commit after flow descriptions):
    - the `MANUAL` overlay position and `overlayRelativePosition` on Open/Swap overlay actions
    - `overlayAnchors` in PlayerState
    - `positionInFrame` / `manualOverlayOrigin` in presentation.ts
    - the stage shows `data-overlay-origins`

  - Gamepad triggers (the commit after manual overlay positions):
    - buttons are stored as `Gamepad<index>` in Key/Gamepad trigger keys (`src/core/prototype/gamepad.ts`)
    - `useGamepadButtons` polls connected gamepads in presentation view and while the Key field has focus
    - the E2E spec stubs `navigator.getGamepads`

  - Accessible prototypes (the commit after gamepad triggers):
    - `accessibleContent` in `src/core/prototype/accessibility.ts` maps a screen to sections, links, buttons, images and text
    - `AccessibleContent` and `SkipToContent` (src/ui/present) render it over the canvas
    - Options has "Adapt content for screen readers"

## In progress (uncommitted)

1. **The smaller pending sub-items in the M10 rows** (see Next).

## Next (M10, in order)

1. The smaller pending sub-items in the M10 rows:
   - lists and inline links in accessible text layers
   - dragging a manual overlay into place on the canvas
   - choosing which frame of a GIF the canvas shows
   - reset component state
   - copy/paste interactions
   - marquee-selecting connections
   - responsive scaling
   - reordering actions and else-if
   - the fixed layer rules with Animate matching layers
   - scroll bars

**Stop after M10.** When every M10 row is finished and committed, stop and report to the user. Don't start M11 until the user says to continue. After that, M11–M15 follow `docs/FEATURE_MATRIX.md` (the rows marked Planned or In progress) in milestone order.
