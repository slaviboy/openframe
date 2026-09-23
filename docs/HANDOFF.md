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

- Dynamic strokes and the Brush (rows 166 and 253, after the Pencil's toolbar): `dynamicStrokePath` (`src/core/vector/dynamic-stroke.ts`) samples a path and moves each point along its normal by an offset taken from its distance along the path, so the bumps are the same on every draw; Frequency is how many, Wiggle how far, Smoothen how rounded (it blends a cornered interpolation with a cosine one). `dynamicStroke` on a layer carries them, `setDynamicStroke` centers the stroke as the reference requires, and the scene renderer bumps the path before stroking a vector network. The Brush is `PencilTool` with `id: 'brush'`, which gives its sketches the `sketchStroke.dynamic` settings its toolbar holds.

- Custom brushes (row 254, after dynamic strokes): a `BRUSH` node holds a closed vector layer's network and the size it was made at, beside the file's styles; `brushId` on a layer says which brush paints its stroke. `brushStrokeOutlines` (`src/core/vector/brush.ts`) turns a stroke chain into filled polygons: a stretch brush maps the shape's x to distance along the path and its y across it, a scatter brush repeats the shape along the path facing its direction, and both scale to the stroke's weight. `createBrush` (Create brush on a layer's menu) needs a closed network — every vertex of degree 2 — and the renderer fills those polygons with the stroke's paints instead of stroking the path.

- Text on a path (row 146, after custom brushes): `textPath` on a text layer names the vector it follows, where it starts (0–1) and whether it is flipped; the text layer copies the path's transform, so the path's own coordinates lay it out. `TextShaper.drawOnPath` shapes the text as one line and draws each character clipped out of that line at the point along the path its place falls, turned to the path's direction — kerning and ligatures survive, since the line is shaped whole. `pathRunFor` (`src/core/vector/text-path.ts`) walks the path. `TextPathTool` places it, and Typography has Flip text orientation and Start. The handle that moves the text along its path is `src/editor/chrome/text-path-handle.ts`, drawn with the selection chrome and dragged by the move tool's `text-path-start` gesture, which puts the text at the nearest point on the path.

- Transforms (row 255, finishing M11's planned rows): `repeat` on a group says how its contents repeat — `repeatMatrices` (`src/core/geometry/repeat.ts`) gives the copies' matrices, radial turning about the middle of the group over an angle (the full circle shared between the copies), linear stepping along x or y. The renderer draws the children once per matrix, so no layers are made until `applyTransforms` duplicates them into place. Draw mode's Transform section holds the modifier menu, the settings and Apply transforms to selection. Two things to know: a group's `children` array is live, so `applyTransforms` snapshots it before duplicating (otherwise each pass repeats the previous pass's copies), and the editor now opens in the mode it was left in (`mode` in view prefs; `EditorShell` restores it before it starts saving it, or the first render would overwrite the stored value).

- **M12 began here.** The timeline and keyframes (rows 262–264): an animation lives on the page — `duration`, `playback` and tracks of keyframes per layer property — with `src/core/motion/animation.ts` holding the reading (`valueAt`, `valuesAt`, `playheadAt`) and the editing (`setKeyframe`, `removeKeyframe`). `MotionPreview` (`src/editor/motion/preview.ts`) shows the animation at the playhead as an open preview transaction the file never takes; since only one transaction may be open, `History` gained a `beforeBegin` hook and the editor clears the preview through `editor.motionPreview` before any edit starts, with `EditorShell` re-applying it after. `TimelinePanel` is the panel; the properties panel's diamonds come from `MotionField` / `KeyframeButton`, and typing in an animated field records a keyframe at the playhead instead of moving the layer (opacity converts between the panel's percentage and the file's share of one). Space plays in Motion mode, handled in the keyboard controller before it holds the Hand tool. Keyframes are selected, dragged (⇧ snaps to tenths) and deleted on the timeline, and Auto-keyframe records one for a property that is not animated yet. In Motion the property fields pass no gesture handlers: a gesture holds the document open, and a keyframe write could not start while one was running; repeated writes from a scrub merge through a `mergeKey`. A keyframe's `easing` shapes the stretch that starts at it — the prototype easings plus `HOLD` — evaluated with M10's solvers through `ease` in the motion core, and chosen from the segment's own control on the timeline. `src/core/motion/presets.ts` holds the preset animations (and the composite styles, which are several presets at once); `applyMotionPreset` writes their keyframes from the playhead, worked out from what the layer is now, and the Animations section in the properties panel offers them. The timeline sits between the sidebars rather than over them, and the toolbar rides above it in Motion. A layer's `anchor` (a share of its own box) is the point `setRotation` turns it around and the Motion preview scales it around; `src/editor/chrome/anchor-handle.ts` draws and drags the target, revealed by ⌥R or Edit anchor point in Motion's Transform section. `src/editor/chrome/motion-path.ts` derives the selected layer's path from its x and y tracks — a box per keyframe, evenly-timed dots between — and the move tool drags a box through `moveKeyframePosition`. A bend lives in `PageAnimation.curves` as `{nodeId, time, x, y}`, how far the middle of the stretch starting at `time` is pulled off its straight line; because a quadratic bezier is the straight run plus a bump peaking in the middle, `curveOffsetAt` simply adds to the eased track values, and it takes its progress from the value itself so easing slides the layer along one fixed curve. Path trim lives on `GeometryFields` as `strokeTrimStart`/`strokeTrimEnd` (shares of the path); `SceneRenderer.trimStroke` cuts the centerline with CanvasKit's `ContourMeasureIter.getSegment` before `drawStrokes` paints it, and wraps around when the start is past the end. `trimStart`/`trimEnd` are animated properties like any other, so the timeline, the diamonds and the preview carry them; the Path preset is flagged `needsTrim` and the Animations list disables it without a centered stroke. Keyframe selection now lives in the store as `motion.selectedKeyframes`, which is what the Inspector's Easing section reads; it reuses the prototype panel's `EasingGraph`, and `KeyframeRef` moved to `@/core/motion/animation` so the store need not depend on commands. The timeline shows a window of the animation (`motion.zoom`/`motion.offset`), so `percent()` maps a moment into that window rather than into the whole duration; `setLayerExtent` says where a track is to end up rather than how far to shift it, which is what lets a drag call it over and over. Keyframe buttons carry a `data-keyframe` of `nodeId|property|time`, which is how the marquee reads back what it swept over. Variables gained an `EASING` type: a keyframe's easing may be a `VARIABLE_ALIAS`, `resolvedAnimation(editor)` looks those up and is what the preview evaluates, while editing keeps working on the stored animation so the binding survives. `src/core/motion/instances.ts` derives an instance's tracks from its main component's, mapped through each layer's `source` and shifted by the instance's own `animationOffset`; `shownAnimation(editor)` is what the canvas is drawn from. The Motion preview begins its transaction with `syncInstances: false`, because the component finalizer would otherwise pull an instance's layers straight back to the component's values.
- **Guides became something to design against, not just to look at** (rows 47 and 93). `rulerGuideCandidates` in `src/editor/interactions/snap-candidates.ts` turns the page's ruler guides and those of the frame being worked inside into rects of no thickness, which join the layers and layout guides every move and resize snaps against; Control still holds a layer off them. The guides themselves are dragged with `rulerGuides` off, since a guide would otherwise be held in place by its own line. `isLayoutGuideRect` is now `isGuideRect`, covering both kinds, and still marks what equal-gap measuring leaves out. For measuring, `guideWorldLine` gives a guide's line in world coordinates and the move tool measures the selection against it as a rect of no thickness reaching across the selection — which reads as the distance to the guide, or as the distance to both edges when the guide crosses the selection. `ToolManager.pointerMove` used to swallow every move over a guide; with ⌥ held it now passes it on so the tool can measure.
- **Marking inside a smart selection** (rows 73 and 77). A row or column of evenly spaced layers now has layers you can single out: `markedLayers` in the editor store holds them, a mark belongs to one selection and goes when it changes, and a marked layer's pink ring is drawn filled rather than open. `smartRingAt` finds the ring under the pointer; the move tool marks on the press and keeps the selection whole (`keepSelection` on the pending move, which is also what stops a click drilling into a single layer). `deleteMarked` and `duplicateMarked` in `src/editor/commands/smart-selection.ts` sit in front of `edit.delete` and `edit.duplicate`, taking the marked layers out of the row or copying them into it and laying the rest out again around them. Dragging a marked layer reorders it: `beginReorder` lifts the marked layers out, `reorderIndexAt` reads the place the pointer is over, `applyReorder` lays the row out around them and `reorderLine` draws the blue line, which rides the same overlay input as the auto layout insertion indicator. Every layer moves from the placement `captureRow` took when the gesture began, so laying the row out over and over does not drift, and a drop back where it came from cancels rather than committing. Row 73 was stale: sections have carried a Dev Mode status since M13.
- **M6 began here.** Row 108 (arc handles) was stale — arcs already flatten and outline through `shapeNetwork`, which reads `arcData` — and row 122 is not an M6 row at all. **Offset path** (row 120) is new: `GeometryService.offsetNetwork` (implemented on the renderer at `scene-renderer.ts`) lays a stroke of twice the amount along a network's closed loops and unions it into the area, or cuts it away when the amount is negative, so the corners turn by a Round or Square join. `src/editor/commands/offset-path.ts` refits each vector layer's box around the result — the box corner moving along the layer's own rotation, as outline stroke does — and keeps each layer's original network against the transaction, so the dialog can offset from the shape again and again as the amount is typed rather than offsetting an offset. `OffsetPathDialog` holds the amount and join, shows the result through an open preview transaction, takes it on Enter or Apply and cancels the transaction on Escape. Offsetting an open path is not offered: it encloses no area to grow.
- **Text became something with outlines** (row 119). Converting text to vector paths needed glyph outlines, which CanvasKit's wasm can produce (`SkFont::getPaths` is compiled in) but never binds to JavaScript, so they are read out here instead. `TextShaper.glyphPlacements` says where each character of a laid-out layer sits — its box's left and the baseline of its line, read the way `drawOnPath` reads them — so line breaking, alignment and letter spacing are the ones that were on the canvas; `src/core/text/glyph-paths.ts` walks those placements and asks a font for each character's outline, falling back to the first bundled font that has the character. `src/engine/text/outline-font.ts` reads a font with **opentype.js** (a new dependency) and turns its quadratics into the cubics the editor draws with. The bundled fonts ship as WOFF2, whose tables are Brotli-packed: every browser WOFF2 decoder builds its bindings with `new Function`, which the app's content security policy forbids (both `wawoff2` and `woff2-encoder` were tried and both are blocked), so `scripts/vite-plugin-font-outlines.ts` unpacks them at build time and serves each as its own chunk through `virtual:font-outlines`, fetched only when text is actually outlined and left out of the precache like the CJK subsets. A user font uploaded as WOFF2 has no outlines to read, and complex scripts come out a character at a time.
- **Flatten and outline stroke learned to read text** (rows 117 and 118). `outline-text.ts` was split so the reading and the writing can be used apart: `textOutlinesFor` reads the glyphs of the given layers without touching the document (a font file has to be waited for), and `replaceTextWithOutlines` puts the outlines in their place inside a transaction someone else opened, returning which layer took each text layer's place. `flattenSelection` and `outlineStrokeSelection` both became async, read the text at or under the selection first, and then do their own work on the outlines in the same undo step — so a group of words and shapes flattens into one layer, and a text layer's stroke is outlined around its glyphs rather than its box. A converted text layer now keeps its strokes, which is what makes the second of those work. Booleans on text (row 116) are not done: the renderer draws synchronously and a boolean group's path is built during a frame, so glyph outlines would have to be cached for it ahead of time.
- **Boolean groups became something you can keep working on** (row 116). The toolbar has a Boolean operations menu (`BooleanMenu` in `Toolbar.tsx`) carrying the four operations and Flatten; running one on a boolean group that is already selected changes that group's operation instead of wrapping it in another, renaming it when it was still called after the old operation and keeping the number a repeated name is given. `SceneRenderer.withStrokeArea` takes each child's stroke area into the shape the group combines, so a stroked layer contributes the ink it draws. Flattening a boolean group needed the combined shape, which only the engine can work out: `GeometryService.booleanOutline` exposes it, and `flattenLayers` gained an `OutlineResolver` seam that core calls for the layer types it can't work out itself, so the core stays free of the engine. Text inside a boolean group still contributes its box: the shape is built while a frame is drawn and glyph outlines come from a font file that has to be waited for, so they would have to be worked out and kept ahead of time.
- **Sketching on dark canvases, and Simplify vector** (rows 109 and 121). `backgroundColorBehind` was split so `backgroundColorAt` can answer for a point rather than a layer, and the Pencil asks it what is under the pointer: a sketch still drawn in the black it starts out with turns white on a dark canvas or frame, while a stroke the designer picked is drawn as it is. `src/core/vector/simplify.ts` thins a path: each contour is flattened, run through the Douglas–Peucker the Pencil already used, and drawn again with Catmull–Rom tangents scaled by how sharply the path turns at each point — so a corner keeps its corner and a square stays square. A loop's repeated closing point is dropped before smoothing, without which the zero-length segment there reads as a straight run and bulges the shape out. Branching paths are left alone: their contours can't be told apart. `SimplifyPathDialog` drives it with a slider over an open preview transaction, showing the point count as it moves. Row 121's other clause was stale — the Lasso has selected points since it was built.
- **The Pen, and the mirroring a point carries** (rows 110 and 112). The Pen snaps its points to what is around them (`snapWorldPoint` against candidates taken when the path began, Control placing a point exactly where the pointer is), trails a thin dashed line from the point last placed to the pointer (`PenTool.rubberBand`, drawn through the overlay's `penRubberBand`), and picks up an open path already drawn rather than beginning another layer — `penResume` and `openEndAt` in `@/core/vector/pen` do the reading, and only layers sitting square in their parent are offered, since the Pen draws in the parent's space. Handle mirroring became a property of the point: `VectorVertex.mirror` in the schema, with `mirroringOf` falling back to reading it off the handles (exact opposites mirror angle and length, anything else mirrors nothing) so nothing already drawn changes. `mirroredTangent` works out what the far handle takes, and the properties panel's Mirroring section sets it while points are selected.
- **Outline stroke reaches the rest of the layers** (row 118). `strokeOutline` now takes an optional store, which is what lets a boolean group outline the shape it combines to; frames fall through to `shapePath`, which already drew their box; per-side stroke weights return the ring `drawIndividualStrokes` paints (the box grown by each side's weight less the box shrunk by it, with no corners or joins, as drawn); and `dashedPath` cuts a dash pattern of any length by walking each contour with `ContourMeasureIter`, since Skia's `makeDashed` takes only one length on and one off — the drawn stroke always had the full pattern through `PathEffect.MakeDash`, so only the outline was short. A frame keeps its contents, so outlining its stroke always leaves the frame in place. Line arrowheads still aren't taken into the outline.
- **Shape builder** (row 115). `SceneRenderer.shapeFaces` cuts overlapping shapes into the separate pieces they make: for every group of the shapes, the area inside all of that group and outside all the rest, worked out with Skia path ops. That is every subset, so the work doubles with each shape and `MAX_FACE_SHAPES` caps it at eight. `src/core/vector/shape-builder.ts` holds the pure side — splitting commands into contours, an even-odd point test (so a hole reads as outside), and the piece under a point — and `src/editor/commands/shape-builder.ts` the three operations: extract takes a piece onto its own layer above, subtract keeps everything but it, merge keeps only what a sweep gathered, each refitting the edited layer through `refitVector`. The tool lives in vector edit mode's secondary toolbar: hovering washes a piece over, a click extracts, ⌥-click subtracts, and a drag gathers what it crosses. It works on the one layer vector edit mode has open; several layers at once is pending, as on row 111.
- **Variable-width strokes finished** (row 114). `WIDTH_PROFILES` in `@/core/vector/vector-width` holds the shapes a width can take along a stroke, each as widths at positions given as a share of the stroke's own weight, so `profileWidthPoints` lays a profile down at any weight and `profileOf` reads back which one is in use (or null, for points of the designer's own). The Width profile section offers them while the Variable width tool is in hand. `strokeOutline` now outlines a varying stroke as the shape it is drawn as — `variableWidthOutline`'s polygons unioned through the new `polygonsOutline` — rather than stroking its centreline at one weight, and `strokeOutset` and the scene index's hit test both follow the varying width, so a tapered stroke is hit where it is drawn rather than within its widest reach.
- **The vector tools' last settings** (row 113). The Paint tool paints with a gradient as readily as a solid colour: `vectorEditPaint` falls back to the layer's first *visible* fill rather than its first solid one, and the Paint section picks the type through `convertPaint`, leaving the stops to the Fill section (the gradient editor is written against nodes, and pulling it out is work for the fidelity pass rather than this row). It also carries a droplet cursor — `dropletSvg` in `src/ui/canvas/cursors.ts`, drawn like the rotate cursor with a white outline — filled where a click would paint a region and hollow where it would clear one. The Eraser gained a shape: `eraserShape` reaches `regionMinusStroke`, which caps and joins the rubbing stroke square instead of round.
- **Vector edit mode reaches further** (row 111). Holding Space while dragging the points' box carries them about instead of resizing or turning them: the keyboard controller sends Space to the running gesture (`ToolManager.setSpaceHeld`) rather than springing the Hand tool when `gestureRunning`, and `dragBox` keeps the shape the resize last left (`shaped`), anchors the carry where the pointer was when Space went down (`lastLocal`), and reads the pointer as though the points had never moved — so letting Space go picks the resize up where it left off. `beginVectorEdit` also opens a shape drawn some other way: `toVectorLayer` builds a vector layer of the same outline through `shapeNetwork`, in the shape's place, carrying only what every layer carries (the shape's own corners, point counts and arcs belong to the shape). Only outlines are converted — `EDITABLE_SHAPES` — since converting a frame would take its children with it. Editing several layers at once is still pending, and is what would let the Shape builder work across layers too.
- **M5 was mostly already done** — rows 95 and 177 to 181 were stale records, not unbuilt work: their claims check out in the source (constraints follow stretched columns through `constrainInFrame`, wrap gaps, baseline alignment, min/max sizing, the handle value popover, the blue suggested-frame dot) and all 45 unit tests and 9 e2e specs they cite pass. **Grid tracks on the canvas** (row 184) is new: `hitGridTrackPill` finds the track under a size pill, `editor.state.gridTracks` holds which tracks are picked out (⇧ picks more, and they go when the selection changes), and the overlay washes them over whether the frame is hovered or not. `src/core/layout/grid-track-edits.ts` works out what happens to the children — one in a track that goes is placed automatically again, the ones after it move up, the ones reaching over it reach one track less, and a moved track carries its children while the ones stepped over shift the other way — and `src/editor/commands/grid-tracks.ts` applies it in one undo step. Dragging a pill reorders; Delete takes the track away rather than the frame. Still pending on that row: dragging children into empty cells with manual positioning, and min/max track sizes.
- **A sweep for stale rows, and the two real gaps it found.** Of the 17 rows still marked In progress with no stated gap, six were simply never flipped — the navigation bar's Assets and Variables tabs (M7 and M8 shipped), the Design/Prototype tabs, the toolbar groups, the layers panel, and the canvas colour, which only wanted the e2e coverage its own note asked for (`e2e/page-color.spec.ts`). Two hid real gaps behind a bare milestone reference. **Reordering pages** (row 60) was not built: `src/editor/commands/pages.ts` moves a page by writing a fractional key between its new neighbours, refusing a drop that changes nothing so it leaves no undo step, and `PagesPanel` drags with a line showing where the page would land. **Dragging lock or hide down the rows** (row 63) was not built either: `LayersPanel` holds one transaction open for the press, sets the row it began on, and gives every row the pointer travels over the same value, committing on release — so a plain click is still an ordinary toggle and a drag is a single undo step. Worth repeating the lesson: a row whose note says "arrives with M<n>" is worthless once M<n> has shipped, and has to be read against the code.
- **M9: copy as code, PDF export, and two more stale rows.** Present offline (row 245) and the SVG clipboard (row 303) were already done — the presentation view is the same `index.html` the service worker precaches, and SVG markup pastes through `isSvgMarkup`. **Copy as code** (row 98) is new: Dev Mode's language, unit and scale moved out of `CodeSection`'s local state into `viewPrefs`, so they are kept per device and the Copy/Paste as submenu copies exactly what the panel shows. **PDF export** (row 300) is new too: CanvasKit has no PDF writer (nothing in the shipped build), so `src/core/export/pdf-document.ts` writes a one-page PDF by hand — the page is the layer's own size in points and carries the layer drawn as a JPEG through `/DCTDecode`, with a cross-reference table of real byte offsets. It is the picture rather than the shapes, which is what the matrix says. The core has no web types, so the PDF's ASCII is encoded by hand rather than with `TextEncoder`.
- **M4 was already done, and M8's last two clauses are built.** Rows 129 and 133 were stale — text on a path came with M11 and has its own spec — verified against 104 unit tests and six e2e specs. **Timing variables** (row 211): `PageAnimation.durationVariable` binds the animation's length to a number variable, `resolvedAnimation` looks it up (leaving the stored length when the variable is gone), and the timeline offers the number variables to bind to, disabling the field while one is bound; unbinding keeps the length the variable last gave it so nothing jumps. **Hide from publishing** (row 215): `VariableNode.hiddenFromPublishing` keeps a variable out of what the file lends, which meant giving libraries something to lend — `importLibrary` now copies the variables its components are bound to, in collections of their own (`freeCollectionName` keeps them apart from the file's), and `remapVariables` points the copied components' bindings at this file's copies; a hidden variable stays behind and the component simply loses that binding, as against a library that never had it.
- **Auto-parenting, rotated measuring, and arrowheads in the outline.** Row 72 was mostly built already — drawing into a frame and dropping a layer on one both parent — so what was missing was **Space to prevent it**: `editor.state.spaceHeld` is the one place that says Space is down (the tool manager sets it, the keyboard controller only springs the Hand tool when no gesture is running), `containerAt` returns the page while it is held and `reparentUnderPointer` does nothing. Row 93: `measureToOutline` in `@/core/scene/measure` measures to a turned layer's real outline — `spanAt` cuts the outline with the line the measurement is drawn along, so a corner pointing away reads as further off than its box would — and the move tool uses it whenever the hovered layer's world transform is not axis-aligned. Row 118: `capPath` gives a line's end marker as an area (the line arrow stroked, the others filled) and `withCaps` unions them into the stroke's outline, so an arrow outlines with its head.
- **The file menu, frame presets and quick-add** (rows 33 and 71). The sidebar's file menu now carries the same actions as the main menu's File section. An **Archive** group of superseded devices joined the frame presets (`FramePresetCategory` also feeds the prototype device chrome, so it needed a body there too). ⌘ while resizing already left children alone — `tx.ignoreConstraints` has been wired to `p.mod` all along — so that clause was stale. **Quick-add** is new: `quickAddButtons`/`hitQuickAddButton` in `selection-geometry.ts` put a + on either side of the frame hovered while the Frame tool is in hand, and `quickAddFrame` copies the frame to that side and pushes the frames beyond it along, in one undo step. The Frame tool sets the hover itself, and keeps it while the pointer is on a button — the buttons sit outside the frame, so without that they vanish as you reach for them, which is exactly what the first run of the e2e caught. The the community preset group is a catalogue of the reference's own asset templates and is recorded as not available offline rather than invented.
- **Outline mode's last three details** (row 48). `HitOptions.includeHidden` lets hit testing reach layers that are hidden but drawn, `editor.state.outlinedHidden` carries the view option down from the canvas (the editor can't read the UI's prefs directly), and the move tool passes it when picking and hovering. `drawOutline` gained two things: the box each layer sits in, behind the new `outlineBounds` view preference and its "Include object bounds" entry, and a hairline showing where a stroke really sits — inside, outside or astride the edge — since outline mode paints no strokes at all.
- **Snapping's last two clauses** (row 92). `matchGap` in `@/core/scene/equal-gaps` collects the gaps a row or column already uses (`gapsInLane`) and places the moving layer so the space beside its neighbour is one of them — so dropping a layer past a row of evenly spaced ones carries that spacing on. Centring between two neighbours still wins when it applies. The resize snap's axis-aligned guard is gone: the resize is worked out from a world point, so the corner being dragged snaps wherever it is, and a turned selection snaps like any other.
- **The grid's last two clauses** (row 184). Every track now carries a `min` and a `max` in the schema, and `sizeTracks` clamps whatever the track's type works out to — a fixed value, a hugged content size or an fr share — so an fr track held back by its largest simply leaves the rest of the space over. The inspector grew Min and Max fields beside each track's size, and changing a track's type keeps the limits it was given. `gridCellAt` in `@/core/layout/auto-layout` says which cell a point in the frame's own space falls in, the nearest track winning in a gap or outside the grid, and the move tool writes `gridColumn`/`gridRow` from it while dragging inside a grid whose Automatic positioning is off — so a child can be dropped into an empty cell.
- **Shortcuts can be changed** (row 45). The keymap always took overrides — `setBindings(defaults, overrides)` — so what was missing was the UI and somewhere to keep them. `src/ui/shortcuts/shortcut-overrides.ts` holds them per device (the whole set under one key, so setting one command's shortcut replaces the set rather than deleting a computed key, which the lint rules forbid), the keyboard controller subscribes and rebinds at once, and `shortcutFromEvent` in the keymap spells what was just pressed in the syntax shortcuts are written in. In the panel a command's keys are a button: clicking listens, the next press becomes the shortcut, Backspace gives the command its own back, Escape leaves it, and Reset all clears everything.
- **Smart selection in two dimensions** (row 77). The three clauses left on this row are built. `detectSmartGrid` reads a grid off the selected layers — rows that overlap vertically, hold the same number of layers, line up in columns, and share one gap across and one down — and `smartShape` hands the canvas whichever shape the selection takes, so the rings, the marking and the drag all work the same in a row and in a grid. A grid carries a spacing handle along each axis and two "space between" fields; `respaceGrid` sets either gap without disturbing the other. Marking follows the documentation: a double-click marks the whole selection, and in a grid ⇧ double-click marks that layer's own row. Delete, ⌘D and the reorder drag all go through `gridSlots`, which reads the grid's places row by row and carries on into new rows below it when a copy needs somewhere to go — so the sequence changes and the layers take the places in order. A grid is rearranged one layer at a time, as the reference's is. **⌘-dragging** a layer of the selection onto another exchanges the two (`swapLayers`), the layer under the pointer ringed while the drag is on. **Resizing within the selection** came from `handledLayers`: when some but not all of a selection is marked, the selection frame — and so its handles, its cursors and everything drawn on it — is the marked layers' own, the resize acts on them alone, and `reflowAfterResize` lays the rest out around them on every frame, reading where they now stand rather than translating from stale starts (which is why it calls `scene.ensure` first: the preview reaches the scene index only when it is rebuilt). The reference's looser 2D arrangements, rows of differing lengths, are recorded as not read rather than guessed at.
- **Pixel preview** (row 37). The canvas is drawn onto a surface of its own at one or two pixels to the design pixel — the resolution it would export at — and that picture is magnified to fill the canvas with `FilterMode.Nearest`, so a curve shows the pixels it lands on rather than a smooth edge. The surface is a child of the scene's own (`Surface.makeSurface`), kept between frames while its size holds and released with its parent, so a redraw costs one extra snapshot rather than a new surface. Below the preview's own resolution there is nothing to magnify and the page is drawn as it always is. It sits in the zoom menu as a submenu — Disabled, 1x, 2x — with ⌃P turning it off and back on at the resolution it was last set to, and it is kept per device with the other view preferences. The chrome is drawn on the overlay canvas above the scene, so the selection, the handles and the pixel grid stay sharp, which is what the reference does too. `rowAt` in `e2e/pixel.ts` reads a row of screen pixels back (a one-row PNG, so its filters predict only from the left), which is how the e2e shows the drawing changes when it is zoomed in and does not when it is not.
- **Export: the settings each format carries, and the rest of SVG** (row 300). An export configuration now holds more than its format, scale and suffix: ignore overlapping layers (off draws the whole page and cuts it to the layer's bounds, which is what a slice already did), the SVG `id` attribute and Simplify stroke, a color profile, image quality for JPG and PDF, and image resampling — `SceneRenderer` samples an image fill bicubic for Detailed and nearest for Basic, the canvas keeping the bilinear it drew before. They reach the engine through `ExportImageOptions` in core, so `thumbnail-service.ts` can name them without importing the engine. **SVG** gained most of what it was missing: boolean groups (through the same `booleanOutline` seam flatten uses), text as the outlines of its glyphs, masks as `<mask>` (`maskRuns` says which siblings a mask covers, and the reference's own masks read alpha, which SVG needs telling), a drop shadow and a layer blur as a `<filter>` (a spread is an `feMorphology` before the shadow), per-side stroke weights as the ring they cover, and image fills as a `<pattern>` carrying the file as a data URI — base64 written out by hand, since core has no `btoa`. Reading a font cannot wait for markup being written, so `renderExportsWithText` works the glyph outlines out first and hands them in; every caller awaits it now. Left out, and listed by each export: pattern fills, angular and diamond gradients, inner shadows, background blurs, noise, and a second drop shadow — chaining `feDropShadow` would shadow the shadow rather than the layer.
- **The canvas as a screen reader reads it** (row 78). The scene canvas is `aria-hidden` and the overlay is an application role, so until now a screen reader found nothing on the canvas at all. `src/core/scene/canvas-outline.ts` reads the page into a list of layers — each described by its name, what it is (a component, an instance or its type in plain words), the words it carries when it is text, and the size and place it takes — in the order the Layers panel lists them, an auto layout frame's children following its own layout order. `CanvasOutline` renders that inside the canvas region — a layer holding others as a labelled `<section>`, a layer on its own as a line of prose, the selected ones marked `aria-current` — clipped to a single pixel rather than hidden with `display` or `visibility`, which would take it out of the accessibility tree, with a live region beside it saying what has just been selected however that was done. It is read-only on purpose: the Layers panel is already the tree layers are picked and moved in. Nothing inside it carries a role or a label of its own, and that was learned the hard way: a first try made every layer a `treeitem`, which broke **607** e2e tests at a stroke because each `getByRole('treeitem', …)` then matched both the panel's row and the mirror's; a second made every layer a labelled `<section>`, which is a `region` landmark, and still broke nine, since the suite queries regions by name too. The mirror describing the same layers twice is as confusing to a screen reader as it is to a locator, so only the one outer `region` is named and everything inside it is plain text. Two e2e assertions that read `getByText('2 layers')` off the whole page now read it off the inspector, since the live region says that too.
- **Vector edit mode opens several layers at once** (row 111). `VectorEditRef` gained `others`, the layers open beside the one the tools act on, each with its own selected points; `openVectorLayers` and `withOpenLayers` read and write that set as a list, so the first of the list is always the layer being worked in. Return opens every selected vector layer; the overlay draws each one's path and points (`drawVectorLayerPoints`, pulled out of `drawVectorEdit`), and the tools' own chrome stays with the active layer. A press first calls `focusLayerUnder`, which brings whichever open layer the pointer is over to the front — a point of it first, then the layer it is inside — after which every tool runs unchanged on the layer it always had. `PointDrag` became a list of layers, so one drag carries the points picked in all of them, each in its own space; Delete and ⇧Delete go through `removeSelectedPoints` for every layer at once; and the Lasso gathers from every open layer. The tools written in one layer's own space — Cut, Bend, Paint, the Eraser, Variable width, the Shape builder, and the selected points' box — keep to the layer being worked in, which is recorded on the row rather than glossed over.
- **Text inside a boolean group** (row 116). The shape a boolean group combines is built while the frame is drawn, and a text layer's glyphs come from a font file that has to be fetched and parsed — which a frame cannot wait for. `GlyphOutlineCache` (`src/editor/text/glyph-outline-cache.ts`) resolves that by reading them off to the side: `get` answers at once with what it already holds and asks for anything missing, keyed by everything the outline depends on (the words, the font, the size, the spacing, the alignment, the box, the style runs), and when an outline arrives it asks the canvas to draw again, so the next frame combines the letters. The renderer takes them through `RenderOptions.textOutline`, used where `backdropOutline` met a text layer and returned its box; exports carry the same seam through `ExportImageOptions`, so an export matches the canvas. The font reader is imported on demand and injectable, so tests need not pull the engine in. Hit testing still meets a text layer's box rather than its letters, which the row records.
- **Large documents, measured in the browser** (row 298). `e2e/large-document.spec.ts` builds 8,192 layers by duplicating one rectangle thirteen times through the editor itself — no fixture, no back door — fits them all on screen and pans with the wheel while reading the gaps between animation frames. They come out at a median of 14.8 ms, the display's own cadence, so the canvas keeps up while a document that size is panned in full; the p95 of 81 ms is a frame missed elsewhere in the page. **Tile caching was built and then taken out**: first as an `SkPicture` of the page replayed on pan, then as a pixel picture of an area half a viewport wider on each side, blitted while the pan stayed inside it. Instrumenting it showed the cache working (50 blits to 20 full draws) and the frame times unchanged to a tenth of a millisecond — on a WebGL surface the cost is rasterizing the pixels, which a cache of the drawn page pays anyway. Both were reverted rather than kept as machinery that buys nothing and can only go stale, and `docs/PERFORMANCE.md` records the numbers and the negative result so nobody builds it a third time.
- **Draw mode reaches the tools built for Design** (row 256). This row was a cross-reference — the vector edit tools, variable width, the Shape builder, pattern fills and the noise, texture and progressive blur effects, all built in sections 4 and 6 — and it turned out to be a stale record rather than unbuilt work, but only checking showed that. Draw gets them because it shares what carries them instead of repeating it: the secondary toolbar is chosen by whether points are being edited, not by the mode, and Draw's right sidebar is Design's panel with sliders and Transform added rather than the rest removed. `e2e/draw-mode.spec.ts` now proves it end to end, which is what the row was missing: a row with no tests is exactly how one sits as Planned while the feature is already there.

## In progress (uncommitted)

Nothing. The working tree is clean apart from anything noted above.

## Next: the visual fidelity pass

Seven commits landed on 2026-09-18, from the 11 saved the reference pages in `reference/app/` (gitignored). Everything measured is in `docs/UI_REFERENCE.md`, which is the committable trace — the pages themselves are the reference's markup and weigh 33 MB.

**Done:** the measurement record; `npm run icons:reference`, an extractor that reads the saved pages and prints a TSX fragment without ever writing the icon map; the toolbar's spacing, padded rows, full-height divider and mode switcher; the panel's section order (Auto layout, Ignore auto layout inside Position, Effects before Selection colors) and its 550 title weight; five icons replaced with the reference artwork; and a **Fid** column in the matrix saying whether a row's look has been held against a reference at all.

**Blocked, and worth asking for.** The remaining 48 hairline icons — the shape tools and every vector-edit tool — are the reason the toolbar still mixes two drawing systems, and **none of them is in these captures**: the pages were saved with every flyout closed and vector edit mode inactive. Two more saved pages would close it: one with the **Shape tools flyout open**, one **in vector edit mode**. Inferring them is the very thing this pass exists to stop.

**Open, and sized.** the reference's panel rows sit on a **28-column grid** (two fields at `1/span 12` and `13/span 12`, the trailing control at `25/span 4`); ours puts a fixed 24px in that trailing column, so the two drift apart as the panel is widened. It touches every row of a 3,700-line file and wants a slice of its own.

Three rules this pass worked to, all worth keeping:

- **A token is re-pointed only when every one of its call sites has been measured.** Otherwise the fix lands at the call site. `--weight-strong` is read by six modules; correcting it centrally would have silently re-weighted the layer tree, the page list and the presentation chrome.
- **The captures are one theme, one mode, one selection state.** the reference declares each token twice, light then dark, so the elevation shadows taken from them are dark-only. Anything appearing only for a shape or a multi-selection has no reference and must stay `—`.
- **Nine CSS declarations referenced tokens that never existed here** — `--color-accent`, `--color-bg-secondary`, `--fg-danger` are the reference's names pasted in without values, so the fallback always won and none could be themed. Grep `var(--color-` before trusting any colour.

## The Dev Mode inspect panel rebuild (in progress)

Started 2026-09-18, after the user put our panel beside `dev-handoff-right-panel` in the four saved Dev Mode captures and said it "looks completely different — we need same alignment, icons, buttons, same sections, labels, code, code structure, dropdowns." The plan is nine slices, each gated on `npm run check`, the related Chromium specs and a full three-browser `npx playwright test` ending 0 failed. Every measurement is in `docs/UI_REFERENCE.md`; `reference/` is gitignored and never committed.

Landed so far:

- `e0605bc` **`primitives.button` did not exist.** It was used 39 times across 10 files, and CSS Modules hands back `undefined` for a missing key — so "Mark as ready for dev", "Copy code", "Download", "Add annotation" and every other secondary button in five panels rendered as browser defaults. Defining `.button`/`.buttonFill` fixed all of them at once. Dev Mode also opens at 374px now (`--sidebar-right-dev-w`), the reference's width, with the max raised to 480 — still mouse-resizable, only the default changed.
- `7ab99d1` **`InspectSection`**, one collapsible shell replacing ten hand-rolled `<section><h3>` copies across five files, with every `aria-label` byte-identical so the ~20 `getByRole('region', …)` queries survived. Fold state lives in a module-level `Map`, in-session only.
- `2a88763` **`InspectHeader`**: the copyable layer name, the actions beside it and the icon/type line. "Copy URL for selected layer" is deliberately absent — we have no per-layer URL, and a button that copies nothing is the dead control this pass exists to avoid.
- `29b0050` **The box model.** `src/core/dev/box-model.ts` computes the reading (size, per-corner radii, per-side stroke and padding, distances to the container's edges) with unit tests; `BoxModel.tsx` draws the reference's nested `gapBox`/`borderBox`/`paddingBox`/`innerSizeBox` with its testids. `e2e/dev-mode.spec.ts:44` moved to `getByTestId('layoutWidth')` **in the same commit**: Playwright matches names case-insensitively by substring, so the box model's `Copy width: 375` and the row's `Copy Width: 375` collide into a strict-mode violation the moment both exist.
- `10e3172` **Layer properties became the container**, holding the box model, the preferences row and then either the rows or the code. The `view === 'code' ? <CodeSection/> : <>…</>` fork is gone — the reference hides nothing when the view changes, only the inside of Layer properties swaps.
- **This commit — the code rebuild.** `generateCodeAspects` labels the pushes the generators already made, so `generateCode` is now `aspects.flatMap(a => a.lines).join('\n')` and copy-as-code is byte-identical. `src/core/dev/code-tokens.ts` is a hand-written highlighter — three scanners (CSS, C-like, XML), no dependency, because the page's CSP is `script-src 'self' 'wasm-unsafe-eval'` and the usual highlighters build their grammars with `new Function`. `CodeAspects.tsx` renders one titled section per aspect with a line-number gutter, token-coloured lines and a `Copy {Aspect}, press shift to copy all code` button; `data-testid="inspect-code"` stayed on the wrapper.

- `afe13b1` … and **this commit** adds the two sections the reference opens with, above Layer properties. **Component information** is entirely real: the main component drawn through `useLayerThumbnail`, and "Explore component behavior" opens and scrolls to the Playground (`revealInspectSection`). **MCP** carries the reference's shape with Openframe's own answers — *Session activity: Not sent* is simply true offline, the token estimate is computed from the code this panel generates, and the example prompt is real text the button really copies. "Open help" and "Set up third-party agents for the reference MCP" are left out, and a line of body text says plainly there is no server behind it. `useCodePrefs` moved to `use-code-prefs.ts` so MCP and the code wells need not import one another.

- **This commit — the type preview, Text content, and the order.** A text layer's Layer properties draws a
  **typography preview** instead of the box model: the sample set in the layer's own font, its size
  measured down the left and its line height down the right, both as copy buttons, with the font named
  under it. **Text content** is a section of its own with a copy action, as the reference gives it. And
  our five extra sections moved **below** the reference's, so the panel reads MCP → Component information → Layer
  properties → Variables → Motion → Text content → Dev assets, then Status, Appearance, Playground, Dev
  resources, Annotations, Measurements and Compare. Only *where* `DevStatusControl` is called moved — the
  Design inspector renders the same component, so its markup is untouched.

- **This commit — the docs.** `FEATURE_MATRIX.md` row 285 rewritten to say what the panel now is, with Fid **`ref~`** rather than the `ref` the plan guessed at: the deviations are real and recorded (the hand-written highlighter, the aspect names for the three languages no capture covers, the type sample drawn as text rather than as a server-rendered picture), and `ref~` is what the legend calls that. Row 297 stays **Not feasible offline** — Code Connect, the VS Code extension, Dev Mode plugins and the org settings all need the cloud — with prose saying the MCP *section* carries the reference's shape and Openframe's own answers, and `ref~`.

**The rebuild is finished**, all nine slices, each through a full three-browser gate. What is still open on this panel, recorded rather than built: The reference's **Transitions**, **Selection colors** and the colour-format control in **Colors** have no counterpart here; the panel's rows still sit on our own grid rather than the reference's 28-column one (that is what the `Right sidebar tabs` row's `ref~` records, and it wants a slice of its own); and section folds are forgotten on reload, since `viewPrefs` is a flat record with no room for a per-section map.

## The eyedropper, from the capture the user supplied (2026-09-18)

After the panel rebuild the user supplied `reference/app/dev_mode_color_picker.html` — the Dev toolbar with Copy colors active — the toolbar's five buttons as markup, and a screenshot of the loupe. One commit, through the usual full gate.

- **Two icons from the real artwork.** `eyedropper` (which the reference labels **Copy colors** in Dev Mode) and `measurement`. The measurement glyph replaces the `width` icon the toolbar had been borrowing; an earlier pass mapped the reference's Measurement glyph onto `width` and had to take it back out, because `width` also serves the Variable width tool. That conflation is now gone.
- **The Dev toolbar** shows Copy colors and Measurement as their own buttons. `design_toolbelt--enabledToolsRow` is a row of plain buttons with no dropdowns, so each tool is its own group rather than sharing one with a chevron.
- **The cursor.** The capture carries it as `cursor: -webkit-image-set(url(…) 4x) 8 24` — a 32px eyedropper whose hotspot is its tip. Ours is the same glyph as an SVG data URI, translated so its tip lands on the same hotspot, with a white outline behind it (as the rotate and droplet cursors have) so it reads on a dark canvas.
- **The loupe** is redrawn from the screenshot: a white rounded tile magnifying the device pixels around the pointer with the sampled one ringed, and a dark pill beside it naming the colour in RGB with *Click to copy*. `Editor.sampleCanvasRegion` is new — the eyedropper needed a square of pixels, not the one it already read.
- **Copy colors really copies.** In Dev Mode the eyedropper puts the hex on the clipboard instead of painting the selection, which is what its label and the loupe's second line promise; everywhere else it behaves exactly as before.

Worth remembering: the tile's magnified pixels must be drawn with the canvas shadow off. Left on, each of the 121 cells casts its own blur and the sample reads as a pale grey mesh rather than flat colour — which is what the first screenshot of it showed.

- **A group of one drops its chevron.** The toolbar was drawing a disclosure beside every group, including the ones holding a single tool, so it opened a menu of one item. Those now render as the plain button they are — the `role="group"` wrapper goes too — which is what Actions has always looked like. In Design that is Comment; in Dev Mode, Copy colors, Measurement and Comment.

Not taken up yet: the **Annotation** button (artwork supplied), and **Inspect** and **Re-center**, which the reference's Dev toolbar also carries.

### The eyedropper cursor, from the reference's own SVG (2026-09-18)

The user then supplied `reference/app/reference_app.min.css.br.css`. It carries the eyedropper cursor as its **source SVG** on `.color_swatch--chit`, at the same `8 24` hotspot as the runtime PNG — a white silhouette under a black drawing with the reference's own drop-shadow filter. That replaces the cursor the previous commit built from the toolbar icon's path. The stylesheet holds only two custom cursors; the other is `.hyperlink_popup--clickable` (a pointing hand with a link), which we have no call site for. The reference's canvas tool cursors are set at runtime through `--cursor-type` and are not in that file, so it settles no others.

`tests/architecture/files.ts` now skips `reference/` when it walks the repo. That folder is gitignored the reference markup, not ours, and the header test only started tripping over it when a `.css` turned up among the `.html` captures.


## The rotation row, and the point a layer turns around (2026-09-18)

Two things the user reported together, and they were one bug and one real gap.

- **The row was collapsed.** `.row` is a three-column grid (`1fr 1fr 24px`) and the rotation row had *four* children — the field, the rotation-origin button, the three turn/flip buttons as one group, and a trailing spacer. So the group landed in the 24px column: each button came out **eight pixels wide**, and the spacer wrapped onto a row of its own. It now has its own `.rotationRow` (`1fr 24px auto`) with the buttons at their natural size, and the origin button's slot is kept even when the button is not offered so nothing shifts.
- **Dragging to rotate ignored the rotation origin.** The Rotation field turned the layer around its anchor — `setRotation` has always read it — but the canvas gesture pivoted on `frameCenterWorld(frame)` whatever the origin was set to. Since dragging a corner is how a layer is usually turned, the feature read as broken even though the field path worked. A single selection now pivots on its own anchor (`rotationPivotWorld`); a multi-selection still turns around the middle of the frame it shares, since it has no one anchor. `e2e/transform.spec.ts` covers the drag path now, and the assertion was checked against the unfixed code first: it reads X 355 instead of 260.


## The pen tool's toolbelt and the stroke endpoints (2026-09-18)

From `reference/app/pen_tool_1.html`, the toolbar markup and the endpoint listbox the user supplied, and the vector-tools pages of the docs mirror. Two commits, gated on Chromium per slice and a full three-browser run before handing back — 873 passed, 0 failed, four WebKit wasm flakes re-verified alone.

- **The vector editing toolbelt** is the reference's now: Move · Lasso │ Paint · Bend · Cut · Erase │ More │ Close, with a divider between the groups and each tool named beside its glyph. **Variable width** and **Shape builder** moved behind **More** — the documentation lists them among the vector edit tools and the reference keeps them in the overflow, which is both things at once. *Done* became **Close**, as the reference labels it.
- **The stroke endpoints** were wrong in three ways and are now the reference's: the order (None, Round, Square, then a separator, then the arrows), the labels (*Circle arrow*, *Diamond arrow*), and the set — **Reversed triangle** (`TRIANGLE_FILLED`) did not exist here at all and is now in the schema, drawn by the renderer as the triangle turned to point back down the line. The control is a listbox with the reference's own glyphs rather than a native select, since a select cannot draw the endpoint; `Menu` learned to carry an icon per item, and the trigger keeps `data-value` so tests can still read the chosen cap.

**Not done yet, and recorded in `docs/UI_REFERENCE.md`:** the reference swaps the main toolbar for the toolbelt as soon as the Pen is picked, where ours waits until points are open; and its vector-edit right panel runs Alignment → Position → Mirroring → Corner radius → Fill → Stroke, with the endpoints available on a vector and not only a line.


## The pen tool, second pass: both bars, the vector-edit panel, corner radius, the Stroke section (2026-09-18)

Five commits, each gated on `npm run check`, the related Chromium specs, and a full three-browser run.
The last full run: **912 passed, 0 failed**, one WebKit wasm-load flake re-verified on its own.

The note the previous pass left behind was half wrong, and re-reading the capture settled it.

- **`b5d6687` — two bars, not one.** `pen_tool_1.html` holds *both* bottom toolbars: the Editor toolbelt
  (48px, Pen pressed, mode switcher intact) at offset 2705264, and `secondary_toolbelt` (40px,
  *Vector editing*) floating above it at 2724432. Its container is 96px tall, anchored to the bottom and
  aligned to the top, so the bar clears the toolbar by 8px. The previous note claimed the reference
  *replaces* the toolbar; that was inferred from a page where both were true at once. The vector branch
  became its own element beside the toolbar, and the toolbar renders unconditionally again.
  Also repaired here: **five specs the two previous commits broke and never reran** — Erase had been
  renamed from Eraser, and Variable width and Shape builder had moved behind More.
- **`e79d42f` — the panel is about the points.** The reference's vector-edit panel holds exactly
  Alignment → Position → Mirroring → Corner radius → Fill → Stroke and nothing about the layer. Alignment
  aligns the selected *points* (`alignPoints`), Position is the picked point's place, and Mirroring is the
  reference's segmented group of three pictures. Every group label there is screen-reader only. Ten specs
  read the layer's size while points were open; each now reads it once they are closed.
- **`1e1717f` — a point's corner radius.** `VectorVertex.cornerRadius`, drawn in by
  `roundNetworkCorners` inside `networkStrokePath`, `regionFillPath` and `networkBounds`, so every reader
  downstream sees the shape as drawn while the file keeps the sharp corner. Only where two straight lines
  meet, which is the corner the documentation describes.
- **`1eb9017` — the bar's own buttons and glyphs.** The user pointed out the bar still did not look like
  the reference's, and it did not: its buttons carry **no padding** (`topLevelButtonSecondaryPadding`), so
  the 24px glyph *is* the button, and ours padded them to 32px and stacked each label under its glyph.
  Lasso, Bend, Cut and Erase were hand-drawn approximations and are now the reference's own artwork; Move and
  Paint got vector-edit glyphs, since the bar's Move is not the toolbar's.
- **`5e314ca` — the Stroke section.** Panel selects were measured off two captures and were wrong app-wide
  (grey fill, hover-only border, no chevron; should be 24px on the panel colour inside a hairline with the
  chevron in a 24px column). Everything but position and weight moved behind **Advanced stroke settings**.
  The endpoint triggers draw the end across the whole control, clipped not scaled, mirrored for the End
  point.

**Still open, recorded in `docs/UI_REFERENCE.md` and the matrix:** endpoints are offered for lines alone —
the documentation wants them per point on a vector, which needs a cap on each vector point and arrowheads
drawn on the open ends of a network; and a corner whose neighbouring segment is a curve stays sharp.

## The frame time of a page of text (2026-09-19)

The user reported that zooming out made panning and zooming lag, on
`reference/app/sample-large.openframe`. Measured in Chromium against the production build, every
frame of a pan on that board took **1548 ms** — at 6%, 5%, 3% and 2% alike. Zoom was never what mattered.

- **What it was.** `TextShaper` kept 256 laid-out blocks and evicted the oldest inserted. A page draws its
  layers in the same order every frame, so the block dropped was the one the next frame wanted first: a
  cyclic scan through a cache smaller than the scan hits nothing. Two blocks were held per layer (one for
  measuring, one for painting), so the cliff came at **128 text layers drawn at once**: 128 layers cost
  16.5 ms a frame, 130 cost 988 ms. Zooming out is simply how a board of 212 gets on screen at once.
- **What it is now.** Blocks are kept by the frame that drew them (`beginFrame`, swept at the start of the
  next frame); 256 is a floor for what nothing is drawing, never a cap on a frame's own working set. The
  board now pans at **15.9 ms** a frame.
- **Also.** `underlines()` laid a layer out a second time before checking whether anything was underlined,
  which is what made it two blocks a layer rather than one. Text under three device pixels to the em is
  now drawn as a bar per line and never shaped (`greekedLines`, `GREEK_INK` measured against shaped text
  in `scene-renderer.test.ts`), which is what keeps a 2,120-layer board at 65 ms a frame instead of
  exhausting CanvasKit's memory. Only the canvas and presentation view ask for it: `greekText` is off for
  exports and thumbnails, which draw the glyphs however small they are.
- **Guarded by** `e2e/text-repaint.spec.ts`, which fits the reference board on screen and pans it; it was
  checked against the unfixed code first and fails there. The previous text-repaint spec used ten layers,
  under the old cliff, which is why none of this showed up in the suite.

Numbers and the method are in `docs/PERFORMANCE.md`; the renderer's side is in `docs/RENDERING.md`.

## The Stroke settings dialog, from the user's capture (2026-09-19)

The user supplied the markup of **Advanced stroke settings** and its three menus. It is a titled dialog —
`Stroke settings`, with a close button — holding a **Basic / Dynamic / Brush** segmented control and, in
the Basic tab, labelled rows: **Style**, **Width profile** (with *Flip width points*), a divider, **End
points**, a divider, **Join** and **Miter angle**. The Dynamic and Brush tabs are to follow, from their own
markup. The pass is being built in phases, each its own commit.

- **Phase 1 — an open end of a path draws its own end point.** The reference's End points row is offered
  for any open path, which needed the renderer to draw the ends: a cap now sits on the *point* the path
  stops at (`cap` on the vertex, `src/core/vector/vector-caps.ts`), with the layer's `endpointCap` drawing
  the ends that carry none — which is how the documentation describes it, since an end is set per point in
  vector edit mode. `openEnds` gives each end and the direction the path leaves it in, and `pathEnds` the
  two ends of a path that doesn't branch, so Start point and End point know which is which. The renderer
  cuts the stroke off flat and draws each end's own artwork (`drawCapAt`) when the ends differ or draw a
  marker, keeps the stroke's own cap when they are alike, stops a triangle's path at the head's base
  (`insetEnds`, as a line already did), and takes the ends into the outline (`withEndCaps`) so *Outline
  stroke* and the SVG export keep them. A dashed stroke keeps its dashes' cap; a brush or a width profile
  ends in the shape it is drawn as, which is what the reference's own support table says. Flattening a
  line now carries *both* its ends across, on its two points, rather than only the end one.
- **Phase 2 — the width profiles the reference offers.** `WIDTH_PROFILES` now holds the reference's own six
  and its own names — `UNIFORM`, `WEDGE`, `TAPER`, `QUARTER_TAPER`, `EYE`, `MIRRORED_TAPER` — instead of the
  six of ours it had. The reference draws each as a picture and never says what it is made of, so the
  shapes themselves are derived: a wedge runs straight from full width to a point, a taper falls away in a
  curve, a quarter taper holds its width until the last quarter, an eye is pointed at both ends, and a
  mirrored taper is a taper at either end. `setWidthProfile` and `flipStrokeWidths` (in
  `src/editor/commands/properties.ts`) lay one down and read it back the other way, and
  `canTakeWidthProfile` says when it can be laid at all — the documentation rules out a branching network
  and a dynamic or dashed stroke, and a brush leaves no width to vary.
- **Phase 3 — the dialog.** `src/ui/panels/inspector/StrokeSettings.tsx` is the dialog, out of `Inspector.tsx`
  along with the `val`, `SliderRow` and `MotionField` helpers both need (`fields.tsx`). Its anatomy, what is
  measured in it and what is derived are in `docs/UI_REFERENCE.md`. The select that draws its value rather
  than naming it is now shared (`src/ui/primitives/IconSelect.tsx`), with `EndpointSelect` built on it and
  `MenuEntry.content` for an option drawn as a picture — which keeps its label for a screen reader and for
  testing. The Stroke section's own End points row is offered for any path with two ends, not lines alone,
  and goes quiet on a stroke that is drawn as an area (`canTakeEndPoints`).
- **Also.** `e2e/drop-openframe.spec.ts` handed the 1.6 MB file to the page as an array of bytes for each of
  its three drags, which serialized megabytes of JSON three times and left the test hanging off its 30s
  timeout — it failed on all three browsers under a full run and passed on its own. The bytes now cross once,
  as base64, and the test runs in 1.5s instead of 15.7s.

## The docs, held against what is actually here (2026-09-23)

The user asked for every MD file to be checked against the code as it stands. Most of them were
current — 135 of the 136 `src/`, `e2e/`, `scripts/` and `public/` paths they quote still exist, every
markdown link between them resolves, and HANDOFF is written on every commit.

One file was badly out of date, and it is the one people read first. **README.md's "Current status"
said M3 was in progress and M4–M15 had not started**, while the matrix reads 214 rows with everything
implemented and this file records M4 through M12 as done. It now carries a milestone table through
M15, says plainly that the work in hand is the visual fidelity pass, lists the docs that existed but
were never linked (rendering, prototyping, performance, the UI reference, this file), and names the two
font scripts. The one stale path was `src/ui/icons/icons.tsx`, in `UI_REFERENCE.md` and in
`extract-reference-icons.mjs`'s own comment; the file is `Icon.tsx`, and the script already looked for both.

The sweep that found them, worth re-running after a docs change:

```sh
grep -oh '`\(src\|e2e\|scripts\|public\)/[A-Za-z0-9_/.-]*`' README.md CONTRIBUTING.md docs/*.md docs/adr/*.md \
  | tr -d '`' | sort -u | while read -r p; do [ -e "$p" ] || echo "MISSING $p"; done
```

## The font dropdown: what it renders, and what hovering it does (2026-09-23)

The user: *"when I open drop down to change fonts it lags — we need some type of preview, and if
possible when user hovers with mouse over a font in drop down it changes the font of the selected
text field as preview; if user then clicks it changes the font actually, if not it uses the old font."*

- **It rendered every family.** `FontPicker` put all 1,946 library families in the page as `<li>`s, into
  a list the stylesheet caps at 280 px — about a dozen rows. It is windowed now, the same way
  `LayersPanel` already does it (`ROW_HEIGHT`, `OVERSCAN`, a spacer `li` holding the scroll height,
  absolutely positioned rows). **Opening the picker: 116 ms → 40 ms**, median of five in Chromium
  against the production build. The spec counts the rows in the page — under 60, against 1,943 before.
- **And it rebuilt the list on every render.** `entries` in `TypographyFields` concatenated and
  `localeCompare`-sorted ~1,950 families each time the panel rendered, which a hover does, since a
  hover writes a preview to the document. It is a `useMemo` on the font registry's revision now.
- **Hovering a library family did nothing at all.** The preview was skipped for any family not loaded,
  which is all 1,946 of them, and the row drew in the UI font because no `@font-face` existed for it.
  Both are fixed: `previews.json` (new, `npm run fonts:previews`, written from the library on disk
  without fetching anything) names one file per family, and a row in view asks for it after 120 ms.
- **Hovering now reads the family and previews it for real** — after the pointer rests 150 ms, so a
  sweep doesn't read one per row. The gotcha worth keeping: it registers with the *engine* only.
  `editor.fonts.add` persists a font into the file's store, so previewing through it would keep every
  font the pointer crossed. Picking is what stores it. Fonts installed on the device are never read on
  hover — that goes through the Local Font Access API.
- **What the E2E can assert, and what it can't.** An auto-width box is only refitted when the change
  commits, so the width field does *not* move during a hover preview — the first draft of the spec
  asserted that and failed for the right reason. What does move is the **Missing** badge: the button
  shows it for a family the engine cannot shape with, so its absence after a hover is the tell that the
  preview is the real typeface and not a fallback.
- **Windowing broke two specs, and one of them was a real gap.** A row that isn't in view is no longer
  in the page, so `getByRole('option', …)` finds nothing unless the search narrows the list first.
  `e2e/cjk.spec.ts` searched "Noto Sans", which matches a hundred library families, and now searches
  each of the four in turn. `e2e/icon-fonts.spec.ts` clicked the family it had just uploaded — and an
  upload lands somewhere alphabetical in 1,947 families, nowhere near what the user is looking at. The
  picker takes a `reveal` family now and scrolls to it, which is what the reference does and what the
  spec was quietly relying on. The active row follows `reveal ?? current` until the user moves it, and
  the row they moved to is remembered against the reveal it belonged to — so no effect has to reset it.

## An emoji is ordinary text (2026-09-23)

The user's rule for it: *"emoji is part of text — pasting an emoji should act as a text field, so a
user can add text with or without emojis."* The engine was never the problem: 😭 shapes to glyph 2385
and drew in full colour as soon as the font was registered. Getting the font there was.

- **It was one 7.6 MB chunk.** `emoji-font-data.ts` inlined the whole 5.7 MB
  `noto-color-emoji-emoji-400-normal.woff2` as base64, so the character sat as a box while that was
  fetched, parsed and `atob`-decoded. It is read from the library under `public/fonts/google/` now,
  in the eleven subsets it is split into, and only the ones a text's own emoji fall in:
  `readEmojiSubsets` (`src/ui/fonts/google-fonts.ts`) picks them with `subsetsFor` from each file's
  `unicodeRange`. **😭 costs 141 KB instead of 5.7 MB.** The `@fontsource/noto-color-emoji`
  dependency is gone, and so is the service worker's deferred-precache list (`isDeferred` is empty
  now) — these are ordinary library files the fetch handler caches as they are asked for.
- **The trap, and why it has a test.** The obvious route was Fontsource's own subsets of the same
  font, reached through the CJK subset plugin. Their `cmap` reports the glyph — `getGlyphIDs` on
  subset 9 gives 89 for 😭 — but they carry no `COLR`/`CPAL` table, so CanvasKit paints **nothing at
  all**, not even in black. It looks like a working font right up until it is drawn. The library's
  subsets paint in full colour. `text-shaper-draw.test.ts` now counts coloured pixels, which is the
  only assertion that would have caught it.
- **`subsetsFor`** moved out of `cjk.ts` into `src/core/text/font-subsets.ts`, since the emoji
  subsets and the CJK subsets pick the same way. `cjk.ts` re-exports it, so nothing else moved.
- **The E2E leans on the box again**, and needs a yardstick that can never be drawn: a private-use
  character. Every missing glyph has the same advance, so a line of them measures exactly what a line
  of undrawn emoji would. It was run with the emoji loading switched off first and fails there.

## A character no font covers gets one (2026-09-23)

The user pasted "The tab chips and ← stay usable" into a text layer and got a box. It was never an
input problem — the character goes in, there is simply no glyph for it. The bundled Inter Latin subset
is declared `U+0000-00FF, …, U+2191, U+2193, …`: it carries **↑ and ↓ but not ← or →**, and nothing
else registered had them either. Probed against the app's own font set, `A` shapes to glyph 2, `↑` to
479, and `←`, `→`, `✓` and `★` all to 0.

Self-inflicted, too: *Use smart quotes/symbols* types `→` from `->`, `←` from `<-` and `▢` from `[ ]`,
so three of its eight replacements drew a box — and `e2e/emoji.spec.ts` asserted the `->` conversion
while never checking it drew.

- **The fix** mirrors the CJK subsets. `SYMBOL_FALLBACK_FILES` (`src/engine/text/font-files.ts`) names
  three files already shipped under `public/fonts/google/` — Noto Sans Math, Noto Sans Symbols 2 and
  Noto Sans Symbols, ~580 KB together — which `readSymbolFallbacks` (`src/ui/fonts/google-fonts.ts`,
  the file that already holds the `fetch` exemption for same-origin reads of what ships with the app)
  reads on demand. `TextShaper.registerSymbolFallbacks` keeps them out of `this.families`, since a long
  per-run fallback list is what makes layout slow; `symbolFallbacksFor` adds them only to layers whose
  text has symbols (`containsSymbols`, `src/core/text/symbols.ts`).
- **The trigger is exact, not a guess at ranges.** `TextShaper.uncoveredCodePoints` asks every
  registered typeface for a glyph with CanvasKit's `Typeface.getGlyphIDs`, so text with only ™ or ↑ —
  which Inter *does* carry — never pulls the 580 KB. `CanvasHost` watches for it on the same
  `editor.history.subscribe` the CJK loader uses (preview ops emit too, so it fires while typing);
  `PresentationRenderer.loadTextFonts` does the same for presentation view.
- **The files are picked by measured coverage, not by their declared `unicodeRange`** — that range says
  the `mayan-numerals` subset of Noto Sans Symbols 2 carries U+2190, and opening the file says it does
  not. The unit test checks coverage against the real files.
- **Also:** `outlineTextSelection` built its fallback list from `availableFonts()`, which excludes every
  internal fallback — so **Outline text** on a symbol, an emoji or CJK silently dropped the character.
  `TextShaper.fallbackFamilies()` (new, optional on `TextLayoutService`) is now consulted first.
- **The test that would have caught it:** `e2e/symbols.spec.ts` leans on the box being *uniform* — every
  missing glyph has the same advance, so a line of arrows and a line of stars measured exactly alike.
  It was run against the unfixed code first and fails there.

## The Dynamic and Brush tabs, from their own captures (2026-09-19)

The user supplied the Dynamic tab, the Brush tab and two saved pages — `reference/app/brushes_streched.html`
and `brushes_scatered.html` — which hold the Brushes list and the Brush tab as it stands for each kind of
brush. The tab is not one tab: a **stretch** brush carries Direction, a **scatter** brush carries Gap,
Wiggle, Size jitter, Angular jitter and Rotation, and both end with Width profile.

- **Phase A — the Dynamic tab.** Three scrubbable shares (`%`), each scrubbed from its own glyph as the
  Miter angle field is, in place of the sliders we had; then a divider and the same End points row the Basic
  tab draws. A dynamic stroke bumps the path away from its own points, so an end point kept on a vertex sat
  off the line: `bumpedEnds` in `src/core/vector/dynamic-stroke.ts` walks the subpaths the bump walks and
  says where each end landed and which way the bumped path leaves it, and `vectorEnds` draws there. The
  same bump now shapes `strokeOutline`'s centreline, so *Outline stroke* and the SVG export give back the
  line that is on screen rather than the straight one underneath it — a gap nothing had noticed.
- **Also.** `docs/TESTING.md` records the trap that cost time here: a `vite preview` left running serves the
  build it was started with, and `playwright.config.ts` reuses it, so specs fail against a stale bundle.
- **Phase B — the brush picker.** The `<select>` of names is now the reference's own control: a button the
  width of the tab drawing the stroke that brush makes, with the name in its tooltip, which opens a
  **Brushes** dialog beside the settings one (`right-start` flips it to the left of its own accord, which is
  where the reference's sits). The list groups what the file has under *Stretch brushes* and *Scatter
  brushes*, marks the one in use with a check, and draws a picture per brush — `brushStrokeOutlines` over a
  straight chain, the same trick the width-profile pictures use, so a brush's picture and its stroke cannot
  drift apart. The reference ships PNGs of its own 25 brushes; ours are the file's, made from a closed vector layer.
- **Phase C — what a brush's kind asks for.** The captures differ by kind, and so does the tab now: a
  stretch brush carries **Direction**, a scatter brush **Gap**, **Wiggle**, **Size jitter**, **Angular
  jitter** and **Rotation**, and both end with **Width profile**. They are one optional `brushSettings` on
  the layer (`BrushSettingsSchema`), stored only where they differ from `DEFAULT_BRUSH_SETTINGS` — the
  capture's own numbers, since the reference ships 25 brushes each with its own and ours are made from a layer with
  nothing to carry. `brushStrokeOutlines` took the settings and the width points: a stretch brush lays
  along `reverseChain` when it runs backward and scales by the width where each part of the shape falls, a
  scatter brush steps by the shape's length plus the gap and gives each copy its offset, size and turn from
  a repeatable noise of its index — the rule `dynamic-stroke.ts` already follows, so a stroke draws the
  same way every frame. `canTakeWidthProfile` no longer refuses a brushed stroke: that was ours, and the
  documentation only rules out branching paths and dynamic or dashed strokes.
- **The brushes every file has.** The Brush tab was disabled in a file with no brushes, since ours are made
  from a closed vector layer while the reference ships 25 of its own — the one thing in the tab the
  reference does not do. `src/core/vector/brushes-builtin.ts` now holds eight of ours (Leaf, Wedge, Chisel,
  Ribbon; Dot, Dash, Triangle, Petal). They are not layers in the file: the same eight in every file,
  nothing added to what is saved, ids in the root's own `0` replica, and `brushById` looks at them before
  the document — so the three places a brush is read (the renderer, `applyBrush`, the list) go through it
  and a layer that names one still finds it after a save and an open.
- **The reference's own twenty-five brushes.** The eight I drew are gone: the list is the reference's own, by its
  names and in its order. The capture holds each brush as a 756 × 108 picture of the stroke it makes and
  nothing of its vector shapes, so `scripts/extract-reference-brushes.mjs` (`npm run brushes:reference`, beside the
  icons one) reads the shapes back out of the pictures — thresholded, traced as loops of pixel corners with
  their holes wound the other way, simplified — and writes `src/core/vector/brushes-reference.ts` (generated,
  committed, 26k points). A stretch brush is the whole picture; a spray is a mark and a spread, measured
  from where its specks fell, and a brush that overlaps into a band is a slice of that band levelled onto a
  straight axis. `docs/UI_REFERENCE.md` records what is exact and what is read off a picture.
  - Picking a brush brings its own numbers to the tab, which is what the captures show (`settingsOfBrush`).
  - Four things had to give for the reference's brushes to be drawable at all: a copy steps by the size it
    was actually laid at (so a size jitter cannot open a slit), copies go down in two batches (so a hole in
    one cannot cancel the ink of its neighbour), a shape is walked and simplified for the size it is being
    drawn rather than at one unit always, and `networkStrokePath` stopped looking down every segment at
    every step — that walk was the square of the points, a fifth of a second on a brush of 3,000 of them,
    and `src/perf/scene-perf.test.ts` now guards it.
