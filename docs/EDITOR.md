# Editor Architecture

The editor layer (`src/editor`) turns user input into document operations. It has no React dependency and can be tested without a browser (see `src/editor/**/*.test.ts`).

## The `Editor` facade

[`src/editor/editor.ts`](../src/editor/editor.ts) owns:

| Member | Responsibility |
|---|---|
| `doc: DocumentStore` | The document. Only history/transactions mutate it. |
| `history: History<EditorMeta>` | Transactions, undo/redo stacks, change notifications |
| `state: EditorStore` | Selection, hover, tool, mode, per-page viewports, expanded layers, rename target |
| `scene: SceneIndex` | Derived world transforms, bounds and spatial index for the active page |
| `commands: CommandRegistry` | Every user-invokable action |
| `ids: IdGenerator` | New node IDs for this session's replica |

Undo and redo restore editor metadata as well (the active page and the selection), so undoing a deletion brings the selection back.

## Transactions and history

```ts
// One-shot edit: one undo step
editor.history.run('Rename', (tx) => tx.set(id, 'name', 'Avatar'));

// Gesture edit (drag, scrub, color picking): live preview, then one undo step
const tx = editor.history.begin('Resize');
tx.set(id, 'size', { width: 120, height: 80 }); // repeated sets coalesce
tx.flushPreview();                               // notifies renderer/UI of live changes
editor.history.commit(tx);                       // or editor.history.cancel(tx) on Escape
```

**Rules**
- Only one transaction can be active at a time.
- `flushPreview` emits a `preview` ChangeSet whenever anything was applied since the previous preview, including a repeated `set` of the same field that coalesced into an existing op. (Counting ops is not enough: a scrub changes the document without adding ops.)
- `commit` runs the finalizers, then the invariant check in dev and test builds. If either throws, the transaction is **canceled and the error rethrown**. The document is never left half-edited.
- Selection changes on their own are not undo steps.
- Every change emits a `ChangeSet`: ops, changed fields per node, and structurally changed parents. Its `source` is one of `commit`, `undo`, `redo`, `preview`, `cancel`.
  - Autosave records all changes except `preview`.
  - The renderer and UI react to all of them.

## Commands and shortcuts

[`src/editor/commands`](../src/editor/commands) holds the single registry used by keyboard shortcuts, toolbar buttons, menus, the command palette and tests.

```ts
{
  id: 'arrange.bringForward',
  label: 'Bring forward',
  category: 'Arrange',
  shortcuts: ['Mod+]'],
  enabled: (e) => e.selection.length > 0,
  run: (e) => e.history.run('Bring forward', (tx) => reorder(tx, e.selection, 'forward')),
}
```

**Shortcut syntax** ([`keymap.ts`](../src/editor/keymap/keymap.ts))
- Write modifiers and a key joined by `+`. `Mod` is ⌘ on macOS and Ctrl elsewhere, so off macOS `Ctrl+…` and `Mod+…` name the same chord.
- `Backspace` and `Delete` name the same key: a shortcut spelled with either matches both physical keys.
- Several commands may share a key; the keyboard controller runs the first one (in registration order) that is enabled. Return, for example, selects children with the Move tool and places an object with a shape tool.
- **Keyboard-only use:** F6 (or Ctrl+F6) focuses the active tool button in the toolbar; ←/→ move between tool buttons and Enter or Space activates one, handing focus back to the canvas. With a frame, section, slice or shape tool active, Return places a 100×100 layer centered in the visible canvas area (one undo step), selects it and returns to the Move tool.
- Letters and digits match on `KeyboardEvent.code`, so Option/Alt combinations work on every keyboard layout.
- User overrides replace a command's defaults. `Keymap.conflicts()` reports chords that more than one command uses.

**Commands implemented in M1**

| Category | Commands (shortcut) |
|---|---|
| Tools | Move (V), Hand (H), Scale (K), Frame (F / A), Section (⇧S), Slice (S), Rectangle (R), Line (L), Arrow (⇧L), Ellipse (O), Polygon, Star, Place image (⇧⌘K) |
| Scale tool (K) | Selects like the Move tool. Dragging a handle scales the selection proportionally, contents included (positions, sizes, stroke weights, corner radii), from the opposite side, or from the center with ⌥; no rotation. While it is active the properties panel shows **Scale**: a multiplier (type `2` or `2x` and press Enter, or pick a preset), proportional W/H fields, and a 3×3 anchor box (default top left) that decides which point stays fixed. Locked layers are not scaled. |
| Sections | Wrap in new section (⌥⌘S), Remove section and keep contents (⌘⌫); Ungroup (⇧⌘G) also releases sections |
| Edit | Undo (⌘Z), Redo (⇧⌘Z / ⌘Y), Delete (⌫), Select all (⌘A), Select inverse (⇧⌘A), Select matching layers (⌥⌘A), Select all with same fill / stroke / properties, Deselect (Esc) |
| Object | Show/hide (⇧⌘H), Lock/unlock (⇧⌘L), Rename (⌘R) |
| Arrange | Bring forward (⌘]), Send backward (⌘[), Bring to front (⌥⌘]), Send to back (⌥⌘[) |
| Page | Add, Delete, Duplicate |
| View | Zoom in (⌘+ / ⇧+), Zoom out (⌘− / ⇧−), Zoom to 100% (⇧0), Zoom to fit (⇧1), Zoom to selection (⇧2) |
| Hierarchy | Select children (Enter), Select parent (⇧Enter), Next / previous sibling in layers order (Tab / ⇧Tab, wrapping around) |

**Keyboard focus rules** ([`keyboard-controller.ts`](../src/ui/keyboard/keyboard-controller.ts)):
- Text fields keep all their keys.
- Plain navigation keys (Tab, Enter, arrows) run editor commands only while focus is on the canvas or the page body. When a widget is focused, such as the layers tree, a menu or a button, the key belongs to that widget. For example, arrows in a focused layers tree move through rows instead of nudging layers.
- If a shortcut's command can't run right now, the key goes to the browser. Tab with nothing selected therefore still moves keyboard focus.
- Shortcuts are ignored during a pointer gesture, except View commands.

## Tools

Tools are pointer state machines ([`src/editor/tools`](../src/editor/tools)). The `ToolManager` routes events to the active tool and provides navigation that works in every tool:
- **Space**: temporary hand tool; releasing Space returns to the previous tool
- **Middle mouse drag**: pan
- **Wheel**: pan. Shift+wheel pans horizontally with a mouse wheel.
- **⌘/Ctrl+wheel or trackpad pinch**: zoom around the cursor

### Move tool (V)

| Input | Result |
|---|---|
| Click | Selects the layer under the pointer, using the selection rules below |
| ⌘/Ctrl-click | Deep select: the deepest layer under the pointer |
| Shift-click | Adds or removes a layer. Shift-dragging an already selected layer moves the selection instead of deselecting it. |
| Drag a selected layer | Moves the selection; Shift locks the axis. Dropping over a frame reparents into it, and dragging out of a frame reparents to the page. World position is preserved. |
| Drag on empty canvas or on an artboard's background | Marquee selection. Shift adds to the selection; ⌘ selects deeply. |
| Drag a corner handle or an edge | Resizes. Shift keeps the aspect ratio (or, when every selected layer has **Constrain proportions** on, frees it), Alt resizes from the center. Dragging past the opposite edge flips the layer. |
| Drag just outside a corner (rotate cursor) | Rotates the selection around the center of its bounds and shows a live angle label. Shift snaps a single layer's resulting rotation to 15°, or the rotation delta for a multi-selection. Resize handles take precedence at the corner itself. |
| ⌥-drag a selected layer | Duplicates the selection and moves the copies while the originals stay in place. One undo step; Esc removes the copies. A following ⌘D repeats the drag offset. |
| Snapping while moving and resizing | Snap targets are the edges and centers of visible sibling layers and of the parent frame. A match must be strictly closer than 5 screen pixels. Red guide lines show every alignment, and holding Control disables snapping. When moving, the selection's edges and centers snap, and with Shift only the free axis snaps. When resizing, the edges being dragged snap (axis-aligned selections). |
| Smart selection | When two or more selected, unlocked layers form a row or column with equal gaps (within 0.5 px), the selection shows a pink ring at each layer's center and a pink handle in each gap ([`smart-selection.ts`](../src/core/scene/smart-selection.ts)). Dragging a handle changes every gap by the drag distance (whole pixels, never below 0); the Layout section shows the same value as **Horizontal/Vertical space between**. Each change is one undo step; the first layer stays put. Tidy up (⌃⌥T) turns uneven rows into smart selections. |
| Equal spacing while moving | On an axis that didn't snap to an edge, a selection between two neighbors in its row (or column) snaps where both gaps are equal, within the same 5 px threshold ([`equal-gaps.ts`](../src/core/scene/equal-gaps.ts)). Pink indicators with labels show both gaps. Control disables it; Shift's axis lock is respected. |
| Hold ⌥ and hover (with a selection) | Red distance lines with labels ([`measure.ts`](../src/core/scene/measure.ts)): the horizontal and/or vertical gap to the hovered layer, or the four edge distances when one contains the other. Hovering the selection itself, its content or empty canvas measures to the selection's parent frame or section. ⌥ hover reaches nested layers directly. Pressing or releasing ⌥ updates the lines without moving the pointer. |
| Double-click | Selects the next level down under the pointer. The canvas counts clicks itself (presses within 500 ms and 4 px), because Chromium and Firefox report no click count on pointer events. |
| Esc during a gesture | Cancels the gesture and restores the document |

**Selection rules** ([`src/core/scene/hit-test.ts`](../src/core/scene/hit-test.ts))
- Hidden and locked layers, including anything inside locked or hidden ancestors, cannot be hit.
- Content clipped by a frame with clip content enabled cannot be hit outside the frame.
- Top-level frames act as artboards: clicking their content selects that content, and clicking their empty background starts a marquee. Frames directly inside a section are artboards too.
- Sections are transparent to clicks on their content. The empty body of a section with children starts a marquee inside it; an empty section is selected by clicking anywhere in it.
- A section's title pill (inside its top-left corner) selects the section, and dragging it moves the section. Double-clicking the title renames the section in the layers panel.
- Slices are invisible, so a click selects a slice only when no painted layer is under the pointer.
- Lines show one handle per end point. Dragging an end point moves only that end; Shift constrains it to 45° around the other end.
- Groups and nested frames select as a unit.
- Sibling context: once a layer inside a group is selected, clicking its siblings keeps selecting at that depth.

Positions snap to whole pixels for axis-aligned layers while **Snap to pixel grid** (⌘⇧') is on; otherwise they keep 0.01 px precision.

### Shape tools (F/A, R, O)

- Drag to draw. Shift makes a square or circle; Alt draws from the center.
- Click without dragging to place a 100×100 layer.
- The new layer goes inside the deepest visible, unlocked frame under the starting point, in that frame's coordinates.
- Layers are named incrementally per page ("Rectangle 1", "Rectangle 2", …).
- The start point and the dragged corner snap to the edges and centers of layers in the target container, shown by red guides. Hold Control to draw without snapping.
- After drawing, the editor returns to the Move tool.

### Place image (⇧⌘K)

- The command opens the system file picker, which accepts multiple files. Chosen images are imported ([`ui/images/import-image.ts`](../src/ui/images/import-image.ts)), added to `editor.images` (which persists them), and loaded into the tool.
- A hint at the top of the canvas names the next image and how many remain.
- Each click places one image:
  - On a rectangle, ellipse, polygon or star, it replaces the top fill: an existing image fill keeps its mode and rotation.
  - Anywhere else, it creates a rectangle at the image's pixel size, centered on the click, inside the frame under it, and named after the file.
- After the last image, or on Escape, or when switching tools, the remaining images are discarded and the Move tool returns.
- Dropping image files on the canvas, or pasting them (with no Openframe layers on the clipboard), places them with `placeImages`. They form a row with 20 px gaps, centered on the drop point or on the visible canvas, in one undo step.
- Files that fail to import are reported in a dismissible notice; the rest still import.

### Crop mode

- **Entering:** double-click a layer that has an image fill and no children, click **Crop image**, or choose **Crop** in the image mode menu. The **Crop image** command does the same.
  - `beginCrop` switches the paint to `CROP` without moving the image, as its own undo step (`toCropPaint` in [`core/image/crop.ts`](../src/core/image/crop.ts)).
  - The layer becomes the only selection, and `editorState.croppingId` is set.
- **Pointer input:** while `croppingId` is set, the ToolManager routes pointer input to `CropController` ([`interactions/crop.ts`](../src/editor/interactions/crop.ts)):
  - **Layer handles** move the crop edges. The layer's transform and size change, and `imageTransform` is recomputed so the image stays fixed on the canvas.
  - **Corner handles of the whole image** (round, on the dashed outline) scale the image uniformly about the opposite corner.
  - **Dragging inside** the crop or the image repositions the image.
  - Each drag is one transaction.
- **Leaving:** Return (`image.applyCrop`, which runs before Select children), Escape, clicking outside, or any selection or page change ends crop mode. The crop is kept.

### Masks

`object.useAsMask` (⌃⌘M, or Ctrl+Alt+M off macOS; also in the context menu) runs `toggleMask` ([`commands/masks.ts`](../src/editor/commands/masks.ts)). Each use is one undo step.
- **Every selected layer is already a mask:** `isMask` and `maskType` are cleared.
- **One other layer is selected:** it becomes a mask for the siblings above it.
- **Several layers are selected:** `wrapSelection(…, 'GROUP', { name: 'Mask group', after })` groups them in the same transaction, and the bottom-most layer becomes the mask.

A mask applies to the siblings above it, up to the next mask (`maskOf`, `maskRuns`); a hidden mask masks nothing. Hit testing treats masked content outside the mask's shape as clipped. The Mask section (Alpha / Vector / Luminance, Remove mask) appears when every selected layer is a mask. View › Mask outlines (`maskOutlines` view preference) outlines masks in green.

## Structure commands

[`src/editor/commands/structure.ts`](../src/editor/commands/structure.ts):

| Command | Shortcut | Behavior |
|---|---|---|
| Group selection | ⌘G | Wraps the selection in a group. The group goes into the parent of the top-most selected layer, at that layer's z-position. Layers keep their canvas position and relative order. |
| Frame selection | ⌥⌘G | Same as Group selection, but the container is a frame sized to the selection bounds |
| Ungroup | ⇧⌘G | Removes the selected groups and frames. Their children move to the container's parent at its z-position, keeping their canvas position. |
| Duplicate | ⌘D | Copies each selected layer directly above itself. When the selection is the previous set of copies, the new copies are offset from their sources by the same distance, so repeating ⌘D keeps stepping. |
| Flip horizontal / vertical | ⇧H / ⇧V | Mirrors the selection around the center of its bounds. Flipped layers keep a rotation of 0°. |

**Group semantics** ([`src/core/document/groups.ts`](../src/core/document/groups.ts)) are enforced by a commit finalizer inside the same transaction, so undo stays atomic:
- **Hug:** a group's origin and size always equal the union of its direct children's geometry, measured in the group's own space. When the origin moves, the group transform and the children transforms are adjusted together, so nothing moves on the canvas. This includes rotated groups.
- **Emptiness:** a group left with no children is deleted, and the deletion cascades up to parent groups.

## Align and distribute

[`src/editor/commands/align.ts`](../src/editor/commands/align.ts) — locked layers are never moved; each command is one undo step.

| Command | Shortcut | Behavior |
|---|---|---|
| Align left / horizontal centers / right | ⌥A / ⌥H / ⌥D | Several layers align to their combined bounds. A single layer aligns to its parent frame or group; on the page it doesn't move. |
| Align top / vertical centers / bottom | ⌥W / ⌥V / ⌥S | Same as above, on the vertical axis |
| Align … to parent | ⇧ + the shortcut | Every layer aligns to its own parent frame or group |
| Distribute horizontal / vertical spacing | ⌃⌥H / ⌃⌥V | Needs three or more layers. The outermost layers stay put and the gaps between neighbors become equal. |
| Tidy up | ⌃⌥T | Needs two or more unlocked layers ([`tidy.ts`](../src/editor/commands/tidy.ts), layout in [`core/scene/tidy.ts`](../src/core/scene/tidy.ts)). Layers are grouped into rows by vertical overlap (reading order) and placed in a grid: column widths and row heights are the largest item, items sit at the top-left of their cell, and the horizontal and vertical gaps are the median of the current non-negative gaps (10 px when there are none). The grid starts at the selection's top-left corner on whole pixels. Works in world space, so layers in different frames can be tidied together. |

## Clipboard

**Pieces**
- [`src/editor/clipboard/payload.ts`](../src/editor/clipboard/payload.ts): the payload and its validation.
- [`paste.ts`](../src/editor/clipboard/paste.ts): paste placement.
- [`src/ui/clipboard/clipboard-controller.ts`](../src/ui/clipboard/clipboard-controller.ts): the browser integration.

**Transport**
- ⌘C and ⌘X use the browser's native `copy` and `cut` events, so they work in every browser without permission prompts.
- The payload goes on the system clipboard as HTML, base64-encoded in a data attribute. The plain-text flavor contains only the layer names, so pasting into other apps shows readable text.
- Other Openframe tabs read the HTML flavor back.
- Text fields keep native clipboard behavior.

**Payload**
- Copied: the full node subtrees, each root's world transform, and the selection's world bounds.
- Paste treats clipboard contents as untrusted input and rejects the payload when any of these checks fail:
  - prototype-pollution-safe JSON
  - schema validation
  - layers only
  - unique ids
  - parent chains stay inside the payload and have no cycles
  - size limits

**Placement**

| Paste | Placement |
|---|---|
| ⌘V with one frame selected | Inside the frame. Centered in the frame if the copied bounds fall outside it. |
| ⌘V with several frames selected | One copy on top of each frame, at the same position relative to the frame the layers were copied from (the payload's `sourceOrigin`, recorded when every copied layer shares one frame parent). Centered in the frame when there is no source frame or the position falls outside it. One undo step; all copies are selected. |
| ⌘V with layers selected | Above the top-most selected layer, in its parent |
| ⌘V with nothing selected | On top of the page. Keeps the copied position if it is visible, otherwise centers in the view. |
| ⇧⌘V, paste over selection | Centered on the selection bounds |
| ⇧⌘R, paste to replace | Each selected layer is replaced by a copy centered on it |
| Right-click → Paste here | Centered on the right-clicked point, on top of the frame or section under it (or the page), regardless of the selection. Disabled when nothing can be pasted. |

When the chosen parent can't hold the pasted layers (a section pasted into a frame, for example), the paste moves up to the nearest ancestor that can, directly above the frame it left.

- Every pasted layer gets a new id.
- A paste is one undo step.
- Browsers fire no paste event for ⇧⌘R, so it reads the async Clipboard API when permitted, otherwise the tab's last copy. Browsers may reserve ⇧⌘R for a hard reload.

### Copy and paste properties

[`clipboard/properties.ts`](../src/editor/clipboard/properties.ts) defines `PropertiesPayload`, which has three kinds:
- **`all`:** `layerProperties` of one layer. Optional fields that are absent are recorded as `null`, so pasting clears them.
- **`paint`:** a single fill or stroke.
- **`effect`:** a single effect.

**Commands**
- `edit.copyProperties` (⌥⌘C) needs exactly one selected layer.
- `edit.pasteProperties` (⌥⌘V) applies to every selected layer as one undo step.
  - `applyProperties` sets only the fields the target type supports: corner fields on frames and rectangles, a uniform radius on polygons and stars, and no fills or stroke position on lines.
  - It skips values that are already equal.

**Clipboard transport**
- The system clipboard carries the payload as base64 JSON in a `data-openframe-properties` attribute, validated with zod on read. The clipboard controller also keeps the last payload in the tab, because the async Clipboard API may be denied.
- A fill, stroke or effect row with `data-copy-property="fills:0"` becomes focused and highlighted when clicked. A native ⌘C on it copies just that row. A native paste of a `paint` or `effect` payload appends it to each selected layer.

### Selection colors

[`core/color/selection-colors.ts`](../src/core/color/selection-colors.ts):
- **`selectionColors(store, ids)`** walks the selected layers and their descendants in order. It collects visible solid and gradient paints from fills and strokes, skipping image paints and mask layers. Paints are keyed by type, color (or sorted stops) and opacity. Each entry records every usage (`{ node, field, index }`) and the layers using it.
- **`updateSelectionColor(tx, usages, edit)`** rewrites those usages in one transaction.
- **Inspector section:** shown when several layers are selected, or a selected layer has children (`showsSelectionColors`). Editing a color changes its key, so the usages captured when a gesture starts keep being edited until it ends.

### On-canvas gradient editing

Clicking a gradient swatch in a paint row (single selection) runs `beginGradientEdit` ([`interactions/gradient-edit.ts`](../src/editor/interactions/gradient-edit.ts)), which sets `editorState.gradientEdit = { nodeId, field, index }`. This mode is exclusive with crop mode. While it is set, the ToolManager's canvas-editor slot routes pointer input to `GradientEditController`.

**Handles** come from `gradientHandles` ([`core/color/gradient-handles.ts`](../src/core/color/gradient-handles.ts)), in layer pixels:
- **Linear:** start and end. The implied third point keeps color bands perpendicular.
- **Radial, angular, diamond:** the center, the x-axis edge and the y-axis edge.

**Drags**
- **Handles:** a drag solves the affine map from the three gradient-space points to the moved handles (`gradientTransformFromHandles`). Moving the center of a non-linear gradient translates all three points.
- **Stops:** a drag projects the pointer onto the gradient line.

**Clicking the line** adds a stop colored by `colorAt`. Selecting another layer, changing page, Escape, or clicking away ends editing.

### Eyedropper (I)

[`tools/eyedropper-tool.ts`](../src/editor/tools/eyedropper-tool.ts) is tool `eyedropper`.
- **Hovering:** samples the rendered scene through `editor.sampleCanvasPixel`, which CanvasHost installs with `setCanvasSampler`. The overlay draws a loupe with the color and its hex value. The sampler renders the scene and reads one pixel back in the same task, because WebGL does not keep the drawing buffer between frames.
- **Clicking:** applies the color to every selected layer as one undo step (`applyColorToSelection`). The top visible solid fill takes the color (strokes for lines), or a solid fill is added. The Move tool then returns.
- **Color picker:** its eyedropper button uses the browser's EyeDropper API when it exists. Otherwise it calls `editor.pickColorFromCanvas()`, which the ToolManager wires to `EyedropperTool.pick`.
  - The canvas click resolves the promise with the color, and the previous tool comes back.
  - While picking, the picker ignores outside clicks and Escape.
  - Escape or switching tools resolves the promise with `null`.

### Progressive blur

The Blur type menu (Uniform / Progressive) on layer and background blurs runs `setBlurType` ([`core/effects/effects.ts`](../src/core/effects/effects.ts)). Uniform blurs carry no progressive fields. New progressive blurs ramp from 0 at the top center to the blur radius at the bottom center.

The settings are Start and End radius, and start and end X/Y percentages. **Edit on canvas** runs `beginBlurEdit` ([`interactions/blur-edit.ts`](../src/editor/interactions/blur-edit.ts)):
- It sets `editorState.blurEdit`, which is exclusive with crop mode and gradient editing.
- `BlurEditController` then handles the start and end handles. Dragging one moves its offset, clamped to the layer box, as one undo step.
- Escape, clicking away or changing the selection ends editing.

### Effect limits and reordering

**Limits.** `EFFECT_LIMITS` in [`core/effects/effects.ts`](../src/core/effects/effects.ts) caps each layer at 8 drop shadows, 8 inner shadows, 1 layer blur and 1 background blur.
- **Add effect** creates `nextEffectType`: a drop shadow while there is room, otherwise the first type with room. The button is disabled when every type is full.
- **Type menus** disable types that are at their limit.
- **Pasted effects** that would exceed a limit are skipped.
- **Rendering** uses `limitEffects`, the first effects of each type up to the limit, so files with more effects than allowed still draw predictably.

**Reordering.** Fill, stroke and effect rows have a `ReorderHandle`.
- Dragging it over the rows marked `data-reorder-row` moves the row to the drop position.
- With the handle focused, ↑ and ↓ move the row one position.
- Paint lists show the top paint first, so display positions are converted to indices before `moveItem`.
- Each move is one undo step.

### Noise and texture effects

The effect type menu includes Noise and Texture, and their settings come from `GrainSettings` in the Inspector.
- **Noise:** type (Mono / Duo / Multi), blend mode, size, density, and either the color picker (a second color for Duo) or an opacity field (Multi).
- **Texture:** size, radius and Clip to shape.

Numeric edits are gestures (one undo step per drag or commit); menus and the checkbox are single steps. Defaults come from `defaultEffect`. Converting between types keeps visibility, and keeps the radius when both types have one.

### Contrast checker

A fill's color picker shows **Check color contrast** when a single layer is selected. The row passes `getContrastBackground`, which calls `backgroundColorBehind` ([`core/color/contrast.ts`](../src/core/color/contrast.ts)).
- **Background:** the page color, with every visible layer painted before the layer that covers the layer's center (ancestors included) composited on top. Each such layer contributes its visible solid fills at their opacity.
- **Ratio:** `contrastRatio`, the WCAG 2.x ratio, shown truncated to two decimals.
- **Thresholds (`requiredContrast`):**
  - Normal text: 4.5 (AA) and 7 (AAA).
  - Large text: 3 (AA) and 4.5 (AAA).
  - Graphics: 3 (AA only).
  - Auto resolves to Graphics until text layers exist.
- **Fixing:** clicking a failing badge applies `nearestCompliantColor`. It binary-searches HSL lightness towards black and white, keeps the hue and saturation, snaps to 8-bit channels, and takes the smaller change. The edit is part of the picker's gesture.

### Pattern fills

Choosing **Pattern** in a paint row's type menu creates a pattern paint with no source. `PatternSettings` shows the source name, **Select source**, tile type, alignment, scale and X/Y spacing.

**Select source** calls `editor.pickLayerFromCanvas()`, which the ToolManager wires to `LayerPickTool` ([`tools/layer-pick-tool.ts`](../src/editor/tools/layer-pick-tool.ts)):
- **While picking:** tool `pickLayer`. Hovering highlights the layer a click would pick (resolved with `selectionTarget`). The selection is not changed, and a hint appears.
- **Clicking a layer:** resolves the promise with that layer and restores the previous tool.
- **Escape or switching tools:** resolves `null`.

The Inspector then sets `sourceNodeId` as one undo step, unless the pick is one of the selected layers themselves.

### Color profile

**File › Color profile: sRGB / Display P3** (`file.colorProfileSrgb`, `file.colorProfileP3`) runs `setColorProfile` ([`core/color/color-profile.ts`](../src/core/color/color-profile.ts)).
- The setting is stored on the document node, so it undoes and saves like any other edit.
- Color values are not changed.
- The UI reads the profile with `useColorProfile`:
  - Swatches, gradient previews and picker thumbs render with `toCss(color, profile)`, which gives `color(display-p3 …)` for P3 files.
  - The contrast checker converts P3 colors to sRGB (`documentToWcag`) before computing WCAG ratios, and converts a fixed color back to P3.

## Menus and command palette

All menus are built from the command registry, so a menu item and its shortcut always run the same code. A command that can't run right now appears disabled; it is never hidden.

| Surface | Opened by | Contents |
|---|---|---|
| Main menu | The logo button in the navigation bar | Edit, View, Object, Arrange and Page submenus ([`menu-model.ts`](../src/ui/menus/menu-model.ts)) |
| Command palette | ⌘K or ⌘/ | Every palette command, ranked by fuzzy match on label and category ([`fuzzy.ts`](../src/editor/commands/fuzzy.ts)). Enter runs the highlighted command; disabled commands cannot run. |
| Canvas context menu | Right-click on the canvas | Right-click first selects the layer under the pointer. A multi-selection that already contains that layer is kept; empty canvas clears the selection. When layers are under the pointer, the menu starts with **Select layer**, listing them in layers-panel order (groups whose content is hit included, clipped-out content excluded). Layers get clipboard, duplicate/delete, order, group, flip, visibility/lock and rename. Empty canvas gets paste, select all, zoom and the command palette. |
| Layer context menu | Right-click on a layers panel row | The same layer actions, with the same selection rule |
| Page context menu | Right-click on a page | Rename, duplicate and delete. Right-click switches to that page first, because page commands act on the active page. |

**Menu behavior** ([`Menu.tsx`](../src/ui/primitives/Menu.tsx)):
- **Keyboard:** ↑/↓ move, Home/End jump, → opens a submenu, ← or Esc closes it, Enter or Space activates, and typing a letter jumps to the next item starting with it.
- **Placement:** the menu flips and clamps so it stays inside the viewport ([`position.ts`](../src/ui/primitives/position.ts)).
- **Closing:** an outside pointer press, window blur or resize closes the menu.
- **Focus:** closing returns focus to where it was, unless the chosen command focused something else (such as a rename field).

**Clipboard commands** are available in menus and the palette. They use the async Clipboard API when the browser permits it, and otherwise the copy made in this tab.

## View

| Feature | How | Behavior |
|---|---|---|
| Zoom menu | Click the zoom percentage in the properties panel header | Zoom in/out, zoom to fit, zoom to selection, and 50% / 100% / 200%. Items are added as view features ship; the menu never lists anything that doesn't work. |
| Hide UI | ⌘\ | Removes the navigation bar, both sidebars and the toolbar, leaving only the canvas. Press ⌘\ again to restore. |
| Minimize UI | ⌘⇧\ | Collapses both sidebars and keeps the toolbar. The properties panel comes back while layers are selected. The **Show UI** button, or ⌘⇧\ again, restores the full layout. |
| Theme | Main menu → View, or the command palette | **System** (follows the OS, dark when the OS doesn't prefer light), **Light** or **Dark**. Stored in `localStorage` (a tiny UI setting), so it applies before the document loads, with no flash. |
| Rulers | ⇧R, zoom menu, Main menu → View | Top and left rulers drawn just inside the canvas area the floating panels leave uncovered (the shell reports the covered edges through `editor.setCanvasInsets`). Tick labels use 1/2/5 × 10ⁿ steps at least 50 px apart; the selection's extent is highlighted. Ruler guides are shown and editable only while rulers are on. Stored in `localStorage` per device. |
| Nudge amount | Main menu → Preferences, command palette | Dialog with **Small nudge** (arrow keys, default 1) and **Big nudge** (Shift + arrow keys, default 10) in canvas pixels. Values must be positive and at most 10,000; stored per device and applied through `editor.setNudgeAmounts`. |
| Keyboard shortcuts | ⌃⇧?, Main menu → Help, command palette | A panel docked along the bottom lists every command with a shortcut, in tabs by category (Tools, Edit, View, Object, Arrange, Page, Help). Work continues while it is open; commands run from the keyboard are highlighted immediately and remembered per device (`localStorage`). ⌃⇧? again or the close button hides it. |
| Pixel grid | ⌘', zoom menu, Main menu → View | Hairlines on every whole-pixel coordinate, shown only at 400% zoom and above. On by default; stored per device. |
| Snap to pixel grid | ⌘⇧', zoom menu, Main menu → View | While on (the default), moved, resized and drawn axis-aligned layers land on whole pixels. Off, they keep 0.01 px precision. Rotated layers always use 0.01 px. Stored per device. |
| Property labels | Zoom menu, Main menu → View | Number fields in the properties panel show their name as a caption above the field (for example "X position", "Width", "Rotation"). Off by default; stored per device. |
| Outlines | ⌘⇧O, zoom menu, Main menu → View | Every layer is drawn as a one-device-pixel outline of its geometry (black on light canvases, white on dark), with no fills, strokes or clipping, so clipped and overlapped layers are visible. **Include hidden layers in outlines** also outlines hidden layers. Stored in `localStorage` per device. |
| Ruler guides | Drag from a ruler | From the top ruler: horizontal guide; from the left ruler: vertical guide. Page guides snap to whole pixels and to layer edges and centers (⌃ disables). Dropping a new guide over a frame on the page (or in a section) makes it a frame guide in that frame's space. With the Move tool, hovering a guide shows a resize cursor: drag moves it, ⌥-drag drags out a copy, a click selects it (Delete or right-click → **Remove guide** removes it), and dropping it on a ruler removes it. Every change is one undo step. Selecting a guide clears the layer selection and vice versa. |

## Canvas chrome

[`src/editor/chrome/overlay-renderer.ts`](../src/editor/chrome/overlay-renderer.ts) draws on a Canvas 2D overlay:
- frame titles, blue when the frame is selected (for frames on the page and in sections)
- section title pills, blue when the section is selected
- ruler guides (red; blue when hovered or selected) and the rulers, when shown
- dashed outlines for hovered or selected slices
- the hover outline
- selection outlines, following rotation and ellipse shape
- corner handles
- the W × H size label
- the marquee

The overlay never touches the CanvasKit scene, so pointer feedback costs no scene re-render.

## Layers panel behaviors

- **Find (⌘F):** the search button in the layers header, or ⌘F, replaces the layers tree with Find. It matches layer names case-insensitively on **This page** or **All pages**, optionally filtered to Frames, Sections, Groups, Shapes or Slices (results in layers-panel order, hidden and locked layers included). ↓ or Enter selects the next result and ↑ the previous; clicking selects. Selecting a result on another page switches to it, and the layer is panned into view (or zoomed to fit when it is larger than the view). Esc or the close button returns to the layers tree.

- **Order and structure:** rows show the topmost layer first. The panel is virtualized with fixed 32 px rows. Top-level frames are shown in bold.
- **Selecting:** click selects, ⌘/Ctrl-click toggles, Shift-click selects a range.
- **Moving:** drag reorders or reparents. Dropping in the top or bottom quarter of a container row places the layer above or below it; the middle half drops inside. Moves preserve canvas position. Invalid moves are rejected atomically, such as dropping into a descendant or emptying a group.
- **Expanding:** the caret expands or collapses a row; Alt-click on the caret does the same for all descendants.
- **Renaming:** double-click, Enter or F2 renames inline. Enter commits and Esc cancels. ⌘R renames one selected layer inline; with several layers it opens **Rename layers**:
  - **Match** is a regular expression (every occurrence is replaced); empty matches the whole name. Invalid expressions are reported and Rename is disabled.
  - **Rename to** accepts `$&` (Current name), `$1`… capture groups, `` $` `` / `$'`, `$n` / `$nnn` (Number ↑) and `$N` / `$NNN` (Number ↓); **Start from** sets the counter.
  - Counters follow layers-panel order (topmost first). A live preview lists the changes; a result that would be empty keeps the old name. Enter renames in one undo step; Esc cancels.
- **Visibility and lock:** hovering a row reveals the lock and eye toggles. They stay visible while the layer is locked or hidden.
- **Keyboard:** ↑/↓ move the selection, → expands, ← collapses or selects the parent.

## Inspector (Design tab)

**Sections**
- **Nothing selected:** Page (canvas background color and opacity).
- **With a selection:**
  - Scale (only while the Scale tool is active): multiplier, presets, proportional W/H, anchor box
  - Position: X, Y, rotation (not for sections)
  - Layout: W, H (H disabled for lines), Constrain proportions, "space between" for smart selections, and Clip content for frames
  - Appearance: opacity, layer blend mode, corner radius, polygon/star Count and star Ratio (hidden for slices)
  - Fill and Stroke: paint type (Solid, Linear, Radial, Angular, Diamond), color or gradient preview, opacity, visibility and remove on each row; gradient rows add a stops editor. Stroke adds weight and position (lines add start and end points instead), then style (solid or dashed with dash, gap and dash cap), join and miter angle, and — for frames and rectangles — stroke sides with per-side weights.
  - Effects (not for slices): add, type (drop shadow, inner shadow, layer blur, background blur), visibility and remove per row. Shadows show X, Y, blur, spread and a color with opacity; drop shadows add **Show behind transparent areas**. Blurs show a blur radius.

**Color picker** ([`ColorPicker.tsx`](../src/ui/primitives/ColorPicker.tsx))
- Clicking a color swatch opens a popover: a saturation/brightness area (drag, or arrow keys with Shift for 10% steps), a hue slider, an alpha slider, a Hex / RGB / HSL / HSB field row (Enter or blur applies), and **Pick color from screen** in browsers that provide the EyeDropper API.
- The whole session, from opening to closing (Esc or a click outside), is one undo step.
- Grays keep the last chosen hue so the area doesn't jump back to red.

**Number fields**
- They accept arithmetic (`120/2+8`). Input starting with `+`, `*`, `/` or `^` applies to the current value.
- ↑/↓ nudge by 1, or by 10 with Shift. Dragging the label scrubs the value.
- A scrub or a typed commit is one undo step.

**Multi-selection**
- A property that differs across layers shows **Mixed**; setting it applies the value to every layer.
- X and Y use the selection's bounding box.
