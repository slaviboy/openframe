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
| Drag a round radius handle (hover a selected rectangle, polygon or star) | Changes the corner radius by movement along the corner's bisector, with a live "Radius" label. Rectangles have one handle per corner, and ⌥ changes only that corner (turning on independent corners). Polygons and stars have one handle at the top vertex. Handles sit at each corner's arc center, at least 12px in from the corner. They are hidden on locked layers and on layers under 64px on screen. Each drag is one undo step ([`radius-handles.ts`](../src/editor/interactions/radius-handles.ts)). |
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

### Pen (P) and Pencil (⇧P)

- [`PenTool`](../src/editor/tools/pen-tool.ts) keeps one open transaction per path. Each click runs `penClick` ([`core/vector/pen.ts`](../src/core/vector/pen.ts)) on the path in the parent's space; dragging past the threshold re-places the point with a handle. `placeNetwork` ([`vector-draw.ts`](../src/editor/tools/vector-draw.ts)) fits the layer box to `networkBounds` and stores the network relative to it. Clicking a point of the current path (`vertexAt`) closes it into a region and commits; `cancel` (Escape, tool switch) commits an open path or discards a lone point.
- [`PencilTool`](../src/editor/tools/pencil-tool.ts) collects pointer positions and places `pencilNetwork` ([`core/vector/pencil.ts`](../src/core/vector/pencil.ts)) on every move: Ramer–Douglas–Peucker simplification within one screen pixel, Catmull–Rom smoothing, or a straight segment with Shift. New sketches get a round 3 px stroke.
- Vector layers render through `drawVector` and hit-test through `networkOutlines`; `vectorFinalizer` scales networks on resize.
- **Vector edit mode** (`vector.edit`, Return; or a Move-tool double-click): `editorState.vectorEdit` holds the layer and its selected points; `VectorEditController` ([`interactions/vector-edit.ts`](../src/editor/interactions/vector-edit.ts)) is routed as the canvas editor. Point drags run `moveVertices` from the drag's start and `refitVector` against the starting transform; double-clicking a path runs `splitSegment` at `nearestOnSegments`; `vector.deletePoints` (registered before layer delete) runs `deleteVertices`. `drawVectorEdit` draws the segments and points. Return (`vector.done`), Escape, clicking outside the layer or changing the selection leaves.

### Text (T)

- **Creating** ([`text-tool.ts`](../src/editor/tools/text-tool.ts)):
  - A click creates an auto-width text layer (Inter Regular 12, black) with its first line vertically centered on the click.
  - A drag creates a fixed-size box.
  - The layer goes into the frame under the start point, the Move tool returns, and editing starts.
  - The creation commit and every edit of the session share a history merge key, so creating and typing undo as one step.
- **Editing** ([`interactions/text-edit.ts`](../src/editor/interactions/text-edit.ts)):
  - `editorState.textEdit = { nodeId, anchor, focus }` is exclusive with crop mode and gradient or blur editing.
  - Starting it: Return (`text.edit`, before Select children) selects all the text. A double-click with the Move tool places the caret at the click.
  - While it is set, the ToolManager routes pointer input to `TextEditController`: click places the caret, Shift-click extends, double-click selects a word, triple-click a paragraph, and dragging selects. Clicking another text layer edits it; clicking anything else ends editing and selects what was clicked.
  - **Keyboard input** goes to a hidden textarea in the canvas host, which follows the caret so IME candidate windows appear next to it:
    - `beforeinput` handles typing, line breaks, and deletion by grapheme, word or line.
    - `compositionend` inserts IME text.
    - `keydown` handles arrows (Shift extends, ⌥/Ctrl by word, ⌘ to line or text edges), Home/End, ⌘A, ⌘Z/⇧⌘Z, Tab and Esc.
    - Clipboard events copy, cut and paste plain text.
  - Each edit is its own commit, merged into the session's undo step, so properties can still change while editing. ⌘Z while editing steps back through the session's own edits.
  - Ending (Esc, clicking elsewhere, or any selection or page change, via `watchTextEdit`) keeps the layer selected. A new layer left empty is removed with `history.revert`, leaving no undo or redo step; an existing layer emptied is deleted.
- **Fitting:** a history finalizer ([`core/text/text-resize.ts`](../src/core/text/text-resize.ts)) runs at every commit. It fits auto-width and auto-height boxes through the layout service; centered and right-aligned auto width grows around its anchor edge. It also renames layers whose `autoRename` is set to their first line. Renaming a layer in the layers panel or with batch rename clears `autoRename`.
- **Overlay:** while editing, it draws the text box, the selection highlight, and a caret that blinks every 530 ms and restarts on each change.
- **Resizing** follows `resizedTextMode` ([`commands/text.ts`](../src/editor/commands/text.ts)):
  - Typing W, or dragging a side handle, turns auto-width text into auto height.
  - Typing H, or dragging a handle that changes the height, makes an auto-width or auto-height box fixed.
  - Fixed and truncated boxes keep their mode.
  - The Scale tool scales font size, and line height and letter spacing given in pixels.

### Place image (⇧⌘K)

- The command opens the system file picker, which accepts multiple files. Chosen images are imported ([`ui/images/import-image.ts`](../src/ui/images/import-image.ts)), added to `editor.images` (which persists them), and loaded into the tool.
- A hint at the top of the canvas names the next image and how many remain.
- Each click places one image:
  - On a rectangle, ellipse, polygon or star, it replaces the top fill: an existing image fill keeps its mode and rotation.
  - Anywhere else, it creates a rectangle at the image's pixel size, centered on the click, inside the frame under it, and named after the file.
- With several images waiting, **Place all** in the hint (`ImagePlaceTool.placeAll`) places them all with `placeImages` in a row at the center of the visible canvas, selects them, and returns to the Move tool.
- After the last image, or on Escape or Delete (handled by the KeyboardController before commands, so the selection isn't deleted), or when switching tools, the remaining images are discarded and the Move tool returns.
- Dropping image files on the canvas, or pasting them (with no Openframe layers on the clipboard), places them with `placeImages`. They form a row with 20 px gaps, centered on the drop point or on the visible canvas, in one undo step.
- Files that fail to import are reported in a dismissible notice; the rest still import.

### Crop mode

- **Entering:** double-click a layer that has an image fill and no children, click **Crop image**, or choose **Crop** in the image mode menu. The **Crop image** command does the same.
- **Quick crop:** with the Move tool, ⌘-dragging (Ctrl-dragging) a resize handle of a single selected image layer crops instead of resizing. The ToolManager enters crop mode, hands that drag to the `CropController` as a crop-edge drag, and leaves crop mode when the drag ends or is cancelled.
  - `beginCrop` switches the paint to `CROP` without moving the image, as its own undo step (`toCropPaint` in [`core/image/crop.ts`](../src/core/image/crop.ts)).
  - The layer becomes the only selection, and `editorState.croppingId` is set.
- **Pointer input:** while `croppingId` is set, the ToolManager routes pointer input to `CropController` ([`interactions/crop.ts`](../src/editor/interactions/crop.ts)):
  - **Layer handles** move the crop edges. The layer's transform and size change, and `imageTransform` is recomputed so the image stays fixed on the canvas.
    - ⌥ moves the opposite edge by the same amount (symmetric about the center).
    - A fixed **aspect ratio** (`editorState.cropAspect`, reset to Free when crop mode starts) keeps the box's proportions. Corners follow the larger change, and edges resize the other dimension about its middle.
  - **Corner handles of the whole image** (round, on the dashed outline) scale the image uniformly about the opposite corner. With Control, the scale is free along the image's own axes (`scaleImageAxes`), so a rotated image stays rectangular.
  - **Edges of the whole image** resize it about the opposite edge, keeping its aspect ratio; with Control, only along that axis.
  - **Just outside an image corner** (rotate cursor, within 18px), dragging rotates the image about its center (`rotateImageAbout`). ⇧ snaps the image's resulting rotation to 15°.
  - **Dragging inside** the crop or the image repositions the image.
  - Each drag is one transaction. Pressing or releasing ⌥, ⇧ or Control mid-drag updates it (the ToolManager forwards modifier changes to the canvas editor).
- **Image settings** in crop mode, for the single cropped layer ([`ImageSettings.tsx`](../src/ui/panels/inspector/ImageSettings.tsx)):
  - An **aspect ratio** menu: Free, Original, 1:1, 5:4, 4:5, 4:3, 3:4, 3:2, 2:3, 16:9 and 9:16. A fixed ratio reshapes the crop to the largest centered box of that ratio, as one undo step (`setCropAspect`).
  - **Resize to fit** sets the crop box to the bounds of the whole image (`resizeCropToFit`, `fitCropBox`).
  - A **Zoom** slider (10–500%) scales the image about the crop center. 100% is the scale at which the unrotated image just covers the layer (`zoomCropPaint`, `cropZoomPercent`).
- **Leaving:** Return (`image.applyCrop`, which runs before Select children), Escape, clicking outside, or any selection or page change ends crop mode. The crop is kept.

### Masks

`object.useAsMask` (⌃⌘M, or Ctrl+Alt+M off macOS; also in the context menu) runs `toggleMask` ([`commands/masks.ts`](../src/editor/commands/masks.ts)). Each use is one undo step.
- **Every selected layer is already a mask:** `isMask` and `maskType` are cleared.
- **One other layer is selected:** it becomes a mask for the siblings above it.
- **Several layers are selected:** `wrapSelection(…, 'GROUP', { name: 'Mask group', after })` groups them in the same transaction, and the bottom-most layer becomes the mask.

A mask applies to the siblings above it, up to the next mask (`maskOf`, `maskRuns`); a hidden mask masks nothing. Hit testing treats masked content outside the mask's shape as clipped. The Mask section (Alpha / Vector / Luminance, Remove mask) appears when every selected layer is a mask. View › Mask outlines (`maskOutlines` view preference) outlines masks in green.

## Structure commands

- **Boolean operations** (`object.booleanUnion` / `Subtract` / `Intersect` / `Exclude`, ⌥⇧U/S/I/E, registered before the align commands): [`booleanSelection`](../src/editor/commands/boolean.ts) calls `wrapSelection(…, 'GROUP', { booleanOperation })`, which creates a `BOOLEAN_OPERATION` node, and copies fills, strokes and effects from the top layer (the bottom one for subtract). `groupFinalizer` fits boolean groups to their children like groups. The renderer skips their children and draws `booleanPath` — each visible child's `backdropOutline`, placed by its transform and combined with `Path.MakeFromOp` — with the group's own fills and strokes. Hit testing checks [`shapeContainsLocal`](../src/core/scene/boolean-hit.ts) before descending, so only the combined shape is clickable. Ungroup releases boolean groups.
- **Flatten** (`object.flatten`, ⌥⇧F): [`flattenLayers`](../src/core/vector/flatten.ts) collects the visible layers with an outline (through containers, skipping containers with text), converts each with `shapeNetwork` ([`shape-networks.ts`](../src/core/vector/shape-networks.ts)), transforms it into the topmost layer's parent space (`transformNetworkBy`), merges them (`mergeNetworks`) into a `VECTOR` created at the topmost layer's key, and deletes the flattened layers.

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

### Glass

The effect type menu includes Glass, limited to one per layer. Its settings in `GrainSettings` are Angle, Light, Refraction, Depth, Dispersion, Frost and Splay. Numeric edits are gestures, so each drag or commit is one undo step. Converting a blur to glass keeps its radius as frost. The Scale tool scales frost and depth.

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
| Layout guides | ⇧G, zoom menu, Main menu → View; Layout guide section | Frames can have any number of layout guides (Grid, Columns, Rows), drawn over their contents and clipped to them while the frame is unrotated. A guide's row (`data-copy-property="layoutGuides:N"`) copies just that guide (`rowPropertyPayload`, payload kind `layoutGuide`); pasting properties appends it to selected frames. The view option hides all of them (per device) and each guide has its own visibility; hidden guides still snap and still guide constraints. |

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
  - Position: X, Y, rotation (not for sections), and — for layers inside frames without auto layout — Horizontal and Vertical constraint selects (`setConstraint`). Resizing a frame applies them through `constraintsFinalizer` ([`core/document/constraints.ts`](../src/core/document/constraints.ts)), which the move tool skips (`tx.ignoreConstraints`) while ⌘ is held or the Scale tool is active.
  - Layout: W, H (H disabled for lines), Constrain proportions, "space between" for smart selections, and Clip content for frames
    - **Resizing** ([`AutoLayoutFields.tsx`](../src/ui/panels/inspector/AutoLayoutFields.tsx)): Width sizing and Height sizing selects (Fixed, Hug contents, Fill container) appear for auto layout frames, text and children of auto layout frames; `setLayoutSizing` ([`commands/auto-layout.ts`](../src/editor/commands/auto-layout.ts)) maps text onto `textAutoResize` and makes a hugging parent fixed along its flow when a child fills it. Typing W/H (`setSize`) or dragging a handle clears hug and fill on that axis; double-clicking an edge handle (n, s, e, w) of a single selection sets Hug contents on that axis, or Fill container with ⌥ (`MoveTool.pointerDown`).
    - **Auto layout** (frames): Freeform, Vertical layout and Horizontal layout buttons (`applyAutoLayout` / `clearAutoLayout` in [`core/layout/auto-layout.ts`](../src/core/layout/auto-layout.ts)), Wrap for horizontal flows, an Alignment box (nine cells, or three across the flow with an Auto gap), Gap between items with a Gap mode select (Fixed, Auto: between / around / evenly), Gap between rows while wrapping, and Horizontal and Vertical padding (Individual padding shows top, right, bottom and left), and an **Auto layout settings** disclosure with Canvas stacking (`itemReverseZIndex`, applied by `stackingOrder` in the renderer and hit testing) and Inside strokes (`strokesIncludedInLayout`). The sizing selects also offer Add min/max and Remove min and max (`setSizeLimit`), with fields for the limits that are set; Position shows Ignore auto layout (`setIgnoreAutoLayout`) for children of auto layout frames, which then get constraint selects. Text baseline alignment (a checkbox in the settings for horizontal flows, or B in the Alignment group) sets `counterAxisAlignItems: BASELINE`; the layout asks `TextLayoutService.firstBaseline` for each unrotated text child. The Alignment group handles its own keys (arrows, W/A/S/D, X, B) and stops them from reaching the keyboard controller; padding fields pass typed text to `parsePaddingShorthand` ([`padding-shorthand.ts`](../src/ui/panels/inspector/padding-shorthand.ts)) through `NumberField`'s `onText` hook, and a ⌘/Ctrl pointer-down on the padding fields sets `uniformPadding` until they lose focus.
    - ⇧A (`layout.addAutoLayout`) converts selected frames in place, inferring direction, gap, padding, alignment and child order, or wraps any other selection in a new fill-less auto layout frame; ⌥⇧A (`layout.removeAutoLayout`) is registered before the align commands, so it wins only when the selection has auto layout. `layout.suggestAutoLayout` (⌃⇧A; Ctrl+Alt+Shift+A off macOS, where Ctrl+Shift+A stays Select inverse because suggest is registered after it) runs `suggestAutoLayout` ([`core/layout/suggest-auto-layout.ts`](../src/core/layout/suggest-auto-layout.ts)), which clusters children into rows or columns by overlapping extents, wraps multi-layer rows in new frames, and applies `applyAutoLayout` bottom-up. The frames it returns (other than the selected or wrapping frame) go to `editorState.suggested` (`markSuggested`); layer rows show a blue dot for them (`data-suggested`) until `select` clears them.
    - `createAutoLayoutFinalizer` runs after the constraints and text finalizers at commit, and in preview mode while a gesture is open (frames whose children are only being moved are skipped, so a dragged child follows the pointer until release). It lays out affected frames deepest first with `layoutFlow` ([`core/layout/flow-layout.ts`](../src/core/layout/flow-layout.ts)), re-laying out parents of hugging frames that resized and auto layout children resized by fill. Constraints skip children of auto layout frames that are in the flow.
    - **Reordering** ([`core/layout/flow-order.ts`](../src/core/layout/flow-order.ts)): while the move tool drags children of one auto layout frame (after `reparentUnderPointer`), `flowInsertionIndex` finds their drop position from the pointer and `MoveTool.flowInsertion` feeds the overlay's insertion line (`flowInsertionLine`); on release `moveToFlowIndex` rekeys them before the commit lays the frame out. With ⌃ held at release, layers that entered an auto layout frame during the drag (`enteredParent`) get `setIgnoreAutoLayout` instead, and the insertion line is hidden for them. Arrow-key nudges of in-flow children call `moveInFlow` along the flow instead.
    - **Spacing handles** ([`core/layout/layout-handles.ts`](../src/core/layout/layout-handles.ts), [`interactions/layout-handles.ts`](../src/editor/interactions/layout-handles.ts)): with one unrotated auto layout frame selected, `drawLayoutHandles` shows `layoutHandles` while the pointer is over it; `MoveTool` hit-tests them (`hitLayoutHandle`) after resize handles and runs a `layout-handle` gesture that sets padding (`draggedPadding`: ⌥ opposite sides, ⌥⇧ all, ⇧ big nudge steps) or the gap (`draggedGap`) from the values at the start of the drag, as one undo step. A click without dragging cancels that transaction and sets `editorState.layoutValueEdit` (mode from ⌥ / ⌥⇧ at pointer-down); [`LayoutValuePopover`](../src/ui/canvas/LayoutValuePopover.tsx) places a field at the handle, applies the typed value on Return, and closes on Esc, blur or a selection change.
    - **Grid** ([`core/layout/grid-layout.ts`](../src/core/layout/grid-layout.ts), [`GridLayoutFields.tsx`](../src/ui/panels/inspector/GridLayoutFields.tsx)): Grid layout calls `applyGridLayout` (columns, gaps and reading order from the arrangement); `layoutGrid` places items (auto placement from a cursor, or their `gridColumn`/`gridRow`), sizes fixed, hug and fr tracks, and aligns or stretches items in their cells. The Layout section shows column and row counts (Auto rows), per-track sizing, gaps, padding and Automatic positioning (`setGridAutoPositioning`, which writes each child's current cell from `gridCells` when turned off). Grid children get Column span, Row span and a Cell alignment group in Position (`GridChildFields`). Switching to horizontal or vertical calls `clearGridLayout`. On the canvas, `drawGridTracks` shows `gridTrackHandles` (track pills labelled by `trackLabel`, and edge ticks) for the hovered selected grid frame from `gridTracks`; `MoveTool` hit-tests edges within `GRID_EDGE_BAND_PX` of the top or left side (`hitGridTrackEdge`) and runs a `grid-track` gesture that sets the track to `resizedTrack` live, as one undo step.
  - Appearance: opacity, layer blend mode, corner radius, polygon/star Count and star Ratio, and corner smoothing (0–100% slider with an **iOS** 60% preset button) (hidden for slices)
  - Typography (text layers only, [`TypographyFields.tsx`](../src/ui/panels/inspector/TypographyFields.tsx)): font family (a button that opens the [font picker](../src/ui/panels/inspector/FontPicker.tsx); hover previews run in one gesture that picking commits and Esc cancels, installed families load when picked, and uploads go through [`import-fonts.ts`](../src/ui/fonts/import-fonts.ts) into `editor.fonts`) and style, size, line height and letter spacing (typed values such as `Auto`, `24`, `150%`, `2px`, parsed by [`core/text/text-values.ts`](../src/core/text/text-values.ts)), and horizontal and vertical alignment buttons. Text layers also get resizing buttons in Layout (Auto width, Auto height, Fixed size, Truncate text) and no Stroke section yet.
    - **Mixed styles:** while a single layer's text is being edited with characters selected (`textStyleRange`), Typography and Fill read and write those characters through `setTextStyle` and `styleRange` ([`core/text/style-runs.ts`](../src/core/text/style-runs.ts)). Otherwise they apply to whole layers: they set the layer field and clear per-character overrides of that property (`clearRunKeys`). Values that differ across the characters show as Mixed. ⌘B and ⌘I toggle bold and italic: in the text input while editing, or through the `text.bold` and `text.italic` commands for selected text layers.
    - **Type settings** (a disclosure under the alignment buttons): Underline and Strikethrough toggles, Letter case, Paragraph spacing and Paragraph indent (disabled unless the text is left-aligned or justified), List style, Decrease/Increase indentation, List spacing, and Max lines (with a button to remove the limit).
    - **Lists** ([`commands/text.ts`](../src/editor/commands/text.ts), [`interactions/text-edit.ts`](../src/editor/interactions/text-edit.ts)): list changes cover whole paragraphs, including their line breaks (`listSpan`), so a new paragraph typed after an item stays in the list.
      - While editing: Return on an empty item outdents it, or ends the list at level 1. Backspace at an item's start removes its marker. Tab / ⇧Tab and ⌘] / ⌘[ indent inside lists (outside a list, Tab types a tab). Typing a space after "- ", "* ", "1. " or "1) " at a paragraph's start replaces the trigger with a list (`listTrigger`).
      - Each of these is part of the editing session's single undo step.
    - **Links** ([`core/text/links.ts`](../src/core/text/links.ts), [`LinkPopover.tsx`](../src/ui/canvas/LinkPopover.tsx)): `hyperlink` is a style-run key; `setHyperlink` also sets or clears the underline.
      - `openLinkEditor` (⇧⌘U in the text input, or the `text.createLink` command, which first edits a selected layer with all text selected) sets `linkEditing` in the editor store. It needs selected characters or a caret in a link, and closes when the edit ends or moves to another layer. While it is open the canvas doesn't pull focus back to the text input.
      - `LinkPopover` renders inside the shell while text is edited: an address field (Return applies through `normalizeUrl` and `applyLink`, Esc closes, an empty field removes the link), or with the caret in a link (`editedLink`, the whole run of that link) the address with Open, Edit and Remove. It is measured and placed above the text range with `placeFloating` before it becomes visible.
      - Paste: an `http(s)://` or `www.` address (`pastedUrl`) pasted over selected characters links them; ⇧⌘V marks the next paste as plain text.
    - **OpenType features** ([`OpenTypeFields.tsx`](../src/ui/panels/inspector/OpenTypeFields.tsx), at the end of Type settings):
      - Controls: Figure spacing, Figure style and Number position selects, Fractions and Slashed zero checkboxes, case-sensitive forms and capital spacing (only when supported), and the grouped OpenType features list (`listedFeatures`).
      - Support comes from `TextLayoutService.supportedFeatures` for every font in the selection. Options a font can't apply are disabled. A feature that is on but unsupported stays enabled, so it can be turned off.
      - `updateOpenTypeFeatures` maps each covered segment's features through the change (`withFeature`, `withFigureSpacing`, …), so unrelated settings survive. When a whole-layer change leaves every segment the same, the result becomes the layer field.
    - **Variable axes** ([`VariableAxesFields.tsx`](../src/ui/panels/inspector/VariableAxesFields.tsx), in Type settings before the OpenType features): shown when the selection uses one family whose `TextLayoutService.fontAxes` has visible axes.
      - Each axis has a range input and a `NumberField`, with values clamped and stepped by `clampAxisValue`.
      - Slider changes run with `mergeKey: font-variation:<tag>`, so a drag is one undo step. Reset calls `setFontVariation(…, null)`. The weight axis shows the style's weight until a value is stored.
    - **Text direction:** once any selected text contains right-to-left script (`containsRtl`), a Text direction group (Left to right / Right to left) appears under the alignment buttons.
      - The group, and the `text.directionLtr` / `text.directionRtl` commands in the Text main menu and command palette, set `textDirection` on the paragraphs under the caret or selection (`listSpan`), or on whole layers.
      - `moveTextCaret` swaps ← and → inside right-to-left paragraphs (`directionAt`).
    - **Missing fonts** ([`MissingFontsDialog.tsx`](../src/ui/dialogs/MissingFontsDialog.tsx)): `useMissingFonts` waits for `editorState.textLayoutReady`, which `Editor.setTextLayout` sets, then compares every text layer's fonts and run fonts with `textLayout.availableFonts()` (`missingFonts` in [`core/text/missing-fonts.ts`](../src/core/text/missing-fonts.ts)). It re-evaluates on document and font registry revisions.
      - `MissingFontsNotice` sits at the bottom of the navigation rail and opens the `missingFonts` dialog.
      - `replaceFonts` rebuilds each affected layer's font and runs through `replaceFontInText`, so runs that end up equal to the layer font disappear.
    - **Emoji search** ([`emoji-suggest.ts`](../src/ui/canvas/emoji-suggest.ts), [`EmojiSuggestions.tsx`](../src/ui/canvas/EmojiSuggestions.tsx)): `emojiQuery` finds `:name` before a collapsed caret, and `searchEmoji` ranks entries built by `buildEmojiIndex` ([`core/text/emoji-search.ts`](../src/core/text/emoji-search.ts)).
      - The emojibase English data and GitHub shortcodes are dynamically imported the first time a search appears.
      - The store holds the highlight and a dismissed search key. CanvasHost's text input gives it ↑/↓, Return, Tab and Esc first. Picking selects the search text and inserts the emoji with `insertText`.
    - **Smart quotes/symbols:** `viewPrefs.smartSymbols` (`preferences.smartSymbols` in Preferences). CanvasHost passes it to `insertText`, which replaces a completed sequence or a straight quote using `smartSymbol` ([`core/text/smart-symbols.ts`](../src/core/text/smart-symbols.ts)).
    - **Wrap style and hanging lists** (Type settings): the Wrap style select sets `wrapStyle` on the paragraphs under the caret or selection (`setWrapStyle` with `listSpan`), or on whole layers. The Hanging lists checkbox sets the layer's `hangingList` (`setHangingList`), and Hanging quotes sets `hangingPunctuation` (`setHangingPunctuation`), and Vertical trim sets `leadingTrim` (`setVerticalTrim`), which auto layout applies through `TextLayoutService.verticalTrim` (the space above the first line's cap height, measured from the font's "H", and below the last baseline).
    - **Underline details** (Type settings, shown for underlined text): Underline style, thickness (a value field that takes `Auto` or pixels), offset, Skip ink, and Underline color (Text color or Custom color with the shared [`ColorControl`](../src/ui/panels/inspector/ColorControl.tsx)). All go through `setUnderlineOptions` for the selected characters or whole layers. Color edits run inside the picker's gesture.
    - **Multi-edit text:** `text.edit` (Return, or the Multi-edit text button in the right sidebar header while several text layers are selected) calls `beginTextEdit` with the other layers as `mirrors`.
      - The session edits the first layer as usual. `apply` writes each change's text to the mirrors in the same transaction, adjusting a mirror's style runs when its text matched, and clearing them otherwise.
      - Session undo snapshots record every mirror's text and runs, so undo restores each layer. `finish` deletes every layer left empty.
    - **Spell check** ([`core/text/spelling.ts`](../src/core/text/spelling.ts), [`ui/text/spell-checker.ts`](../src/ui/text/spell-checker.ts)): `Editor.spelling` holds a `SpellChecker`.
      - CanvasHost installs it with `setSpellChecker` once text is edited while `viewPrefs.spellCheck` is on, and removes it when the preference is turned off. `loadSpellChecker` imports nspell and the `dictionary-en` `.aff`/`.dic` files as raw text through the `dictionary-en-files` Vite alias, since that package's own entry uses Node's fs.
      - `drawTextEditChrome` underlines `misspelledRanges` (Intl.Segmenter word ranges) with a wavy red line along their selection rectangles.
      - A right-click while editing adds `spelling` to the canvas context menu when the pointer's text offset is inside a misspelled word (`misspelledWordAt`). `spellingEntries` puts its suggestions first; picking one selects the word and inserts the replacement.
    - **Shortcuts** (Text category): ⇧⌘U create link, ⌘⇧8 bulleted list (also ⌥8 on macOS while editing), ⌘⇧7 numbered list, ⌥U / Ctrl+U underline, ⇧⌘X strikethrough, and steps on the physical comma and period keys: ⇧⌘ font size, ⌥⌘ font weight (the next available style), ⌥ letter spacing, and ⇧⌥ line height ([`typography-steps.ts`](../src/core/text/typography-steps.ts), `stepTextProperty`). While editing, the text input applies them to the selected characters; otherwise, commands apply them to the selected text layers. Mixed values step individually.
  - Fill and Stroke: paint type (Solid, Linear, Radial, Angular, Diamond), color or gradient preview, opacity, visibility and remove on each row; gradient rows add a stops editor. Stroke adds weight and position (lines add start and end points instead), then style (solid or dashed with dash, gap and dash cap), join and miter angle, and — for frames and rectangles — stroke sides with per-side weights.
  - Effects (not for slices): add, type (drop shadow, inner shadow, layer blur, background blur), visibility and remove per row. Shadows show X, Y, blur, spread and a color with opacity; drop shadows add **Show behind transparent areas**. Blurs show a blur radius.

**Color picker** ([`ColorPicker.tsx`](../src/ui/primitives/ColorPicker.tsx))
- Clicking a color swatch opens a popover: a saturation/brightness area (drag, or arrow keys with Shift for 10% steps), a hue slider, an alpha slider, a Hex / RGB / CSS / HSL / HSB field row (Enter or blur applies), and **Pick color from screen** in browsers that provide the EyeDropper API.
- **CSS** is one field holding the color with its opacity (`rgba(255, 128, 0, 0.5)`, or `color(display-p3 …)` in Display P3 files). It accepts any CSS color ([`css-color.ts`](../src/core/color/css-color.ts)); a color written in the other color space is converted to the file's profile, and its alpha sets the paint opacity.
- **Document colors** lists the distinct visible solid fill and stroke colors in the file (most used first, up to 48), collected when the picker opens by `documentColors` ([`document-colors.ts`](../src/core/color/document-colors.ts)). Clicking a swatch applies its color and opacity within the picker's undo step.
- The whole session, from opening to closing (Esc or a click outside), is one undo step.
- Grays keep the last chosen hue so the area doesn't jump back to red.

**Number fields**
- They accept arithmetic (`120/2+8`). Input starting with `+`, `*`, `/` or `^` applies to the current value.
- ↑/↓ nudge by 1, or by 10 with Shift. Dragging the label scrubs the value.
- A scrub or a typed commit is one undo step.

**Multi-selection**
- A property that differs across layers shows **Mixed**; setting it applies the value to every layer.
- X and Y use the selection's bounding box.
