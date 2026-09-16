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
  - Reset component state (the commit after accessible prototypes):
    - `resetInteractiveComponents` on navigation actions
    - becomes `resetComponents` on the transition effect
    - PresentationView drops the destination's switched variants and rebuilds the runtime
    - `reactions` is now in `OVERRIDABLE_FIELDS`: interactions added on an instance used to be reverted by instance sync
  - Lists and links in accessible text (the commit after Reset component state):
    - `textBlocks` in accessibility.ts turns a text layer into paragraphs, nested lists and links
    - `AccessibleContent` renders them as `p`, `ul`/`ol` and `a`
  - Reordering actions (the commit after lists and links in accessible text):
    - `src/core/prototype/action-paths.ts` moves actions by path, into and out of Conditional blocks
    - each action's handle in the Prototype tab drags it (dropping before an action or on an Add … action button), and ↑ / ↓ move it
    - else-if isn't built: the docs mirror describes Conditionals as if/else only
  - Copying and pasting interaction details (the commit after reordering actions):
    - `src/editor/clipboard/interactions.ts` encodes the selected connections' interactions for the clipboard
    - `pasteInteractions` in `src/editor/commands/prototype.ts` adds them to the selected layers
    - ClipboardController handles ⌘C / ⌘X / ⌘V for them while connections are selected
  - Marquee-selecting connections (the commit after copying interaction details):
    - `noodleCrossesRect` in connections.ts, and `connectionsInScreenRect` in prototype-geometry.ts
    - the move tool's marquee selects the connections it crosses in the Prototype tab
  - Presentation options (the commit after marquee-selecting connections):
    - Options has Enable keyboard shortcuts and Hide UI; `hide-ui=1` is in `PresentParams` (`src/app/present.ts`)
    - scroll bars were dropped from the pending list: the docs mirror doesn't describe them
  - Fixed layers with Animate matching layers (the commit after presentation options):
    - in `smart-animate.ts`, `matchedLayersStore` shows matching fixed layers untransitioned and dissolves unmatched fixed layers in place
    - `withoutMatchingLayersStore` leaves those fixed layers out of the moving frames
  - Select matching interactions (the commit after fixed layers):
    - `matchingInteractions` and `updateInteractionsAt` in `src/editor/commands/prototype.ts`
    - the Interaction details button selects them
    - `matchedSelection` in PrototypePanel.tsx edits them together
  - A GIF's canvas frame (the commit after Select matching interactions):
    - `gifFrame` on image paints, set with `setGifFrame` from the Fill section's Frame field
    - `SceneRenderer.decodedImage` decodes that frame with CanvasKit's `AnimatedImage`
  - Overlay badges and Remove all interactions (the commit after the GIF canvas frame):
    - `overlayFrames` / `overlayBadgeRect` / `overlayBadgeAt` in prototype-geometry.ts
    - `selectedOverlay` in the editor store
    - `removeOverlayInteractions` / `removeAllInteractions` in `src/editor/commands/prototype-remove.ts`
    - the connection context menu
    - correction: an earlier commit dropped the overlay badge as undocumented, but the overlays page does describe it
    - dragging an overlay into place isn't documented, so it's off the list
  - The easing graph and animation preview (the commit after overlay badges):
    - `easingCurve` / `curveRange` / `clampHandle` in `src/core/anim/easing-curve.ts`
    - `EasingGraph` in `src/ui/panels/prototype/EasingGraph.tsx`, under the easing fields: drags Bézier handles and custom springs, and plays the preview on hover (`data-playing`)
    - rows 229, 230, 231, 235 and 243 had no pending notes left and are now Implemented
  - Only the first of matching connections (the commit after the easing graph):
    - `shownConnections` in prototype-geometry.ts groups the visible connections with `matchingInteractions`
    - it keeps the top-left hotspot's connection in view (hotspots overlapping vertically count as one row)
    - the whole group is drawn while one of them is selected, even outside the selected layers' frames
    - the overlay renderer, `connectionAt` and `connectionsInScreenRect` all use it
  - Dragging through a transition (the commit after matching connections):
    - `dragDirection` / `dragProgress` / `DRAG_FINISH_AT` in `src/core/prototype/drag-transition.ts`
    - in PresentationView, an On drag transition sets `press.scrub`, and the pointer sets `Playing.drag` in place of the time
    - letting go (or a cancelled pointer) finishes it past halfway, or runs it back with `Playing.back` and restores the previous player state
    - the stage's `data-drag` is `dragging` or `returning`
  - Gradient and image fills in Smart animate (the commit after dragging through a transition):
    - `blendPaint` in `src/core/prototype/fill-blend.ts`, used by `blendFills` in smart-animate.ts
    - gradients resample both stop lists with `colorAt`; a solid meeting a gradient becomes a one-color gradient
    - any other change cross-fades, with the old paint's opacity chosen so the pair's alpha follows the blend
    - fill lists of different lengths still show the destination's
  - Sharing interactive component and video states (the commit after gradient and image fills):
    - `sharedVariants` / `sharedVideos` in `src/core/prototype/state-sharing.ts` (frames share states as for scroll: same parent, `namesShareState`)
    - PresentationView's `apply` sets the shared variants in `variantChanges` unless the action resets component state
    - it calls `PresentationRenderer.shareVideo` unless the action resets video state
    - `shareVideo` keeps a pending share until the destination video's element exists, then marks it shown so autoplay leaves it alone
  - The flow starting point tag on the canvas (the commit after state sharing):
    - the renderer records each drawn tag with `setFlowTags`; `flowTagAt` in prototype-geometry.ts finds the preview icon or the name under the pointer
    - the move tool's `flow-tag` gesture calls `moveFlowStartingPoint` (in `src/editor/commands/prototype.ts`) or `removeFlowStartingPoint` on drop
    - `openInlinePreview` bumps `inlinePreviewKey`, so the preview remounts at the selected frame; the Flows list's Preview uses it too
    - Copy link in the Flow starting point section copies `presentUrl` for the flow
  - Share prototype in presentation view (the commit after the flow tag):
    - a Share prototype toolbar button opens a menu whose Copy link copies `presentUrl` built from the tab's own `presentParams`, with the flow selected (`start`) as the node
    - "Link copied" is a polite live region, not a second `role="status"` (presentation.spec reads the footer's status)
  - Renaming a flow on its canvas tag (the commit after Share prototype):
    - double-clicking a tag's name sets `flowRename` in the editor store (the move tool's `flow-tag` gesture, `clickCount >= 2`)
    - `FlowRenamePopover` (`src/ui/canvas/FlowRenamePopover.tsx`) sits on the tag at `flowTagRect`; Enter calls `updateFlowStartingPoint`, Escape or blur closes
  - Editing flow descriptions as formatted text (the commit after renaming a flow on its tag):
    - `DescriptionEditor` moved to `src/ui/panels/prototype/DescriptionEditor.tsx`: a contentEditable area filled from `descriptionHtml`, read back with `textOf` into the same `**bold**` / `- ` / `1. ` / `[text](url)` text; the Bold and list buttons use `document.execCommand`
    - `inlineText` and `descriptionHtml` in `src/core/prototype/description.ts` (the old `formatDescription` stays for its unit tests)
    - browser traps: Firefox's Bold reads the text's weight (the area sets `font-weight: 400`, and a span's explicit weight turns bold off); WebKit ends each list item with a placeholder `<br>` (ignored inside `li`)
    - the group's `data-description` holds the text, for tests
  - Inline preview window at 100% and Respect aspect ratio (the commit after description editing):
    - `InlinePreview` passes `windowSize`, a clamped `onResizeWindow`, `respectAspectRatio` and `onRespectAspectRatio` in PresentationView's `inline` props
    - Resize window to 100% sizes the window to the frame (or `deviceOuterSize` plus the 24 px margins with a device) plus the measured inline header
    - Respect aspect ratio (no device) is an effect keeping the height at the width × the frame's proportions
    - row 241's flow preview icon was already the canvas tag's icon; row 200's instance state sharing came with the state sharing commit
  - Responsive scaling (the commit after the inline preview window at 100%):
    - `RESPONSIVE` in `ScalingMode` (scale 1) and `responsiveSize` in `src/core/prototype/presentation.ts`
    - `frameSizes` in `RuntimeChanges`: `buildRuntime` sets the frames' sizes in its scratch editor, whose constraints and auto layout finalizers lay the layers out
    - PresentationView's `responsiveRef` rebuilds the runtime when the stage, the screen, the scaling or the device changes (keyed by frame and size); restart clears the key
    - a `useEffect` on `runtime` schedules a draw: a draw asked for while a new runtime was being set still used the old `doc` (Chromium and Firefox showed the unscaled frame)
  - Device models (the commit after Responsive scaling):
    - `model` on the page's `prototypeDevice` (Black, Silver, Gold, Blue) and on the resolved preset device (`effectiveDevice`, black by default)
    - `DEVICE_MODELS`, `DEVICE_MODEL_LABELS` and `deviceBodyColors` in `src/core/prototype/device.ts`; `DeviceScreen` and the scene's device item carry `bodyColor` / `edgeColor`, which the renderer paints
    - the Model select in Prototype settings; the stage's `data-device-model` is for tests
    - gate reruns with files both staged and unstaged: `git stash` would disturb the staged part, so save `git diff` to a patch, `git checkout --` those paths (the index stays), rerun, then `git apply` the patch

- Editor UI fixes (after device models): property rows (fills, strokes, effects, layout guides) no longer take focus from their fields, so a type dropdown stays open (`focusPropertyRow` in `ReorderHandle.tsx`); a single row's hidden reorder handle takes no room; both sidebars run flush and square to the window's edges, and the properties panel is resizable from its left edge (`SIDEBAR_RIGHT_MIN` / `SIDEBAR_RIGHT_MAX`, `--right-w`).

- Reference-matched icons (after the editor UI fixes): `src/ui/icons/Icon.tsx` has two sets. `FILLED` holds glyphs copied from saved the reference editor HTML, each on its own 16×16 or 24×24 grid, with two-tone parts in `--fg-tertiary`. `STROKE` holds the Openframe drawings that have no the reference source yet (the remaining shape tools, the vector tools, the typography and layout icons, the logo, `more`, `lock` and `eyeOff`). Tool dropdowns can show a different glyph from the toolbar button via `ToolItem.menuIcon` (Move, Frame and Pen). `textOnPath` exists as an icon only. The grid-cell alignment buttons use the two-tone align icons. The navigation rail tabs are icon-only `RailButton`s, with a hover and focus tooltip giving the name and any registered shortcut, an accent-tinted selected state, and separators.

- Toolbar aligned to the reference's (after the Reference-matched icons): `Toolbar.tsx` groups follow the reference's order (Move, Region, Shape, Creation, Type, Comment tools), then Actions (opens the command palette), a divider and the Draw / Design / Motion / Dev mode switcher. Text on path, Comment and the Draw, Motion and Dev modes are visible placeholders: `aria-disabled` and unchoosable until they are built. Each chevron button is named after its group ("Shape tools", "Region tools"…), 16 px wide with its 24 px glyph centered. Toolbar and rail tooltips share `useHoverTooltip` (`src/ui/primitives/HoverTooltip.tsx`, portaled, `right` or `above`). The Layers header keeps Find next to Collapse layers. The repo has no Prettier config: format with `npx prettier --single-quote --print-width 200`.

- Properties panel aligned to the reference's (after the toolbar): the header has two rows. The top row holds Present and the Prototype view menu (Present in new tab, Preview); the second holds the Design / Prototype tabs and the zoom. Multi-player, Share and Resize to fit are left out, since Openframe has no such features. Sections follow the reference's grid: 40 px title rows, 16 px in from the left and 8 px from the right, and rows of two fields plus a 24 px icon column (`.row`; `.grid2` leaves that column free). Position starts with the align row (`AlignRow`: the six `arrange.align*` commands and a More alignment actions menu for distribute and tidy up). Constrain proportions (The reference's Lock aspect ratio glyph) sits after W / H. Independent corners sits after opacity and radius. Appearance's header holds Apply variable mode, Hide and Apply blend mode. The blend mode and a paint's type are native selects laid invisibly over a glyph (`.iconSelect`), so they keep their combobox roles. A `NumberField` without a label keeps an 8 px scrub strip. Tooltips shift back inside the window, and `useHoverTooltip` also places them `below`. New the reference glyphs: `present`, `dropdown`, `alignMore`, `lockAspect`, `variableMode`, `blendMode`, then `visibility` (the panel's 24 px eye), `more` (three dots), `rotation`, `rotate90`, `flipHorizontal` and `flipVertical`; `more` and `rotation` replaced our stroke drawings. Every `IconButton` and `NumberField` shows a hover tooltip below it (no native `title`). An optional `tooltip` prop gives the reference's wording where it differs from the accessible label: "Hide", "Toggle visibility", "Remove", "Lock aspect ratio", "Apply styles and variables", "X-position". `SegmentButton` adds a command's shortcut to its tooltip. Position's rotation row adds Rotate 90° right (`setRotation` −90) and the flip commands (not for sections). Checkboxes in the panel use the reference's accent-filled style.

- Device frames and the device switcher (after the properties panel): `deviceLayout(device, viewport, margin, { fit, frame })` in `src/core/prototype/device.ts` lays a device out by `DeviceFit` (`FIT` Fit device on screen, `FILL` Zoom device to fill screen, `ACTUAL` Show device at 100%); without its frame only the screen shows. `frame` rides on `DeviceScreen` and the scene's device item, and the renderer paints the body only while it is on. In `PresentationView` the switcher is session-only state (`deviceChoice`, `deviceFit`, `deviceFrame`) over the page's own device, shown as Switch device in the footer, with Z stepping through the fits and `data-device-fit` / `data-device-frame` for the tests.

- Video crop, video from the fill picker, the canvas GIF label and GIF export (after the device switcher): the crop helpers in `src/core/image/crop.ts` are generic over a `CroppablePaint`, so a video fill crops exactly like an image and keeps its type; `CropControls` is shared by `ImageSettings` and `VideoSettings`. Choosing Video for a fill in the Fill section asks for a file and replaces that paint. `animatedGifHash` (`src/editor/images/animated-gif.ts`) is the one place that says whether a layer's topmost visible fill is an animated GIF: the canvas draws its GIF pill next to the size label, and the Export section offers the GIF format only for such layers, writing the stored file itself (at 1x, like SVG), so its frame delays and loop count survive.

- The Variant interactions section and an animated Change to (after row 160): `blendVariantStore` (`src/core/prototype/variant-animate.ts`) blends the prototype's copy of the document before a variant switch with the copy after it. Swapping a variant gives the instance's layers new ids, so they are matched by their path of names (`layerPaths`, now exported with `blendLayer` and `blendFills` from smart-animate). `PresentationRenderer.setVariantAnimation` draws the frame from that blend while the switch runs, and `PresentationView` keeps the copy it animates from, advancing it like its other animations. A Change to offers Instant, Dissolve and Smart animate only, since it blends layers rather than moving a screen. An instance's inherited interactions are listed read-only in a Variant interactions section (`isInheritedInteraction`).

- Variables in prototypes finished (after row 200): Set variable mode already carried extended collections (they are children of the root like any other, and the runtime resolves their overrides), which `prototype-variables.test.ts` now proves end to end. `ExpressionInput` takes an optional editor and variable type, and offers the variables that can go in the field, writing `{Name}` after what is there. Library variables stay out: they need accounts and a server.

- The Accessibility settings dialog (after the variables work, finishing M10): Options > Accessibility settings opens a dialog over the prototype (`dialogScrim` / `dialog` in `PresentationView.module.css`) holding Adapt content for screen readers, replacing the Options item that toggled it. Skip to content still turns the mode on.

- **M11 began here.** The mode switcher (row 36, after M10): `view.drawMode` (⇧D) toggles Design and Draw, the switcher's options set the mode, and `EditorShell` puts it on the root element as `data-mode`, which turns the accent green in Draw. `DRAW_GROUPS` in `Toolbar.tsx` is Draw's toolbar (the move tools and the illustration tools; Brush joins them with the brush tools). The toolbar remembers each group's last-picked tool by group label rather than index, so a mode change keeps it. The mode radio is invisible but takes its own clicks.

- Draw mode's UI (row 252, after the mode switcher): `useLayerThumbnail` (`src/ui/images/useLayerThumbnail.ts`) draws a layer with the rendering engine and is shared by the Assets grid and the Layers list. In Draw mode the Layers rows are `LAYER_ROW_HEIGHT_DRAW` tall and show that preview in place of the type icon; the row (not the preview) handles the double-click that zooms to the layer, since a row captures the pointer for dragging and the click is delivered to it — `document.elementFromPoint` says what is really under it. `SliderRow` in the Inspector adds Draw's sliders (opacity, stroke weight).

- The Pencil's secondary toolbar and stroke sampling (row 253, after Draw's UI): `sketchStroke` in the editor store (color, weight, dashed; `DEFAULT_SKETCH_STROKE` is the reference's thin black line) is what `PencilTool` gives a new sketch, and `SketchToolbar` in `Toolbar.tsx` sets it — it shows while the Pencil is the tool. ⌘-click with the Pencil calls `sampleStroke`, which hit-tests the layer under the pointer and takes its solid stroke's color, weight and style instead of drawing. The Brush tool waits for brush styles to mean something. The bar keeps its own CSS rather than importing `primitives.module.css`: pulling that (and ColorPicker and NumberField) into the toolbar's chunk shifted startup timing enough that `prototype-flow-tag.spec.ts` began failing in Chromium — it double-clicks a fixed canvas point and so races the prototype chrome's first draw. Worth remembering when a canvas test starts failing after an unrelated import.

## In progress (uncommitted)

Nothing. The working tree is clean apart from anything noted above.

## Next (M10, in order)

1. The pending sub-items left in the M10 rows of `docs/FEATURE_MATRIX.md`:

**Stop after M10.** When every M10 row is finished and committed, stop and report to the user. Don't start M11 until the user says to continue. After that, M11–M15 follow `docs/FEATURE_MATRIX.md` (the rows marked Planned or In progress) in milestone order.

## What's left, by milestone

To continue in a new session, tell the assistant: *Read `docs/HANDOFF.md`, check `git status` and `git log --oneline -15`, then continue with "In progress (uncommitted)" and the M10 list below. Stop after M10.* The rows are in `docs/FEATURE_MATRIX.md` (Milestone and Status columns).

**M10 (prototyping): rows still In progress**

**M11 (Draw mode): all Planned**
- The Brush tool and its styles (the Pencil's half of this row is done)
- Brushes with dynamic strokes (frequency, wiggle, smoothen); custom stretch and scatter brushes
- Text on a path
- Transforms: radial and linear repeat, apply transforms

**M12 (Motion mode)**
- Timeline panel: play (Space), auto-keyframe, current time, duration (2000 ms by default), ms/s, loop, once or ping-pong
- Ruler, playhead and zoom; layer tracks (selected and component colors); scaling and moving tracks
- Keyframes: add, select, move (⇧ snaps), delete, and the diamond buttons in the inspector
- Easing presets, hold, custom bezier, springs, saving as variables (In progress: the easing and spring solvers from M10 are shared)
- Variable types for Motion: timing and easing (the M8 / M12 row, In progress)
- Preset animation styles (e.g. spin) and composite styles
- Motion path editing; path trim animation; anchor point (⌥R)
- Animated components
- Animated export: MP4, WebM, GIF, SVG (fps, size, quality, loop), marked Browser limitation in the matrix

**M13 (Dev Mode): Planned, except copy as code**
- Dev Mode toggle (⇧D), the left sidebar (ready for dev, pages with badges, layers), frame pager
- Inspect panel: header, status, box model, List / Code, layout and style code blocks, colors, typography, styles
- Code generation: CSS (px / rem), SwiftUI, UIKit (px / pt), Compose, Android XML (px / dp / sp); unit scale
- Copy as code (Copy as PNG and SVG are done, in M9)
- Redlines on hover and ⌥-hover; saved measurements (⇧M)
- Annotations (⇧T): categories, live properties, filter
- Statuses: ready for dev, completed, changed (automatic); the ready-for-dev view and focus view
- Compare changes: side by side, overlay, property and code diff
- Variables in Dev Mode (details, suggested variables, variables table)
- Assets section (automatic icon detection, downloads) and export; dev resources (links on layers)
- Component playground; animation handoff code (CSS / React / JSON)
