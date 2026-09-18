# Generating `.openframe` files (guide for an AI)

You are being asked to produce a **`.openframe` file** that Openframe can open: a design with text,
images, shapes and arrows. This document is the whole contract. Follow it literally and the file
opens; invent fields and the loader refuses the file with a validation error.

The authority is the code, not this page: the schema is
[`src/core/schema/document.ts`](../src/core/schema/document.ts), the reader and writer are
[`src/platform/package.ts`](../src/platform/package.ts), and the field-by-field reference is
[`docs/DOCUMENT_FORMAT.md`](DOCUMENT_FORMAT.md). This page is the practical subset you need to
generate a file from scratch.

---

## 1. What the file is

A `.openframe` file is a **plain ZIP archive** with exactly three kinds of entries:

| Entry | Required | Contents |
|---|---|---|
| `manifest.json` | yes | What images the package carries |
| `document.json` | yes | The whole design, as JSON |
| `images/<sha256>` | one per image | The raw bytes of an image or video, named by the lowercase hex SHA-256 of those exact bytes, **with no file extension** |

Rules the reader enforces:

- Any other entry name is ignored (it does not break the file).
- Compression is free: deflate or stored both work. The app stores image entries uncompressed
  because image formats are already compressed.
- No encryption, forward-slash paths, no directory entries needed.
- A single entry may not unpack to more than 512 MB.
- Every image listed in `manifest.json` **must** be present and its bytes **must** hash to its name,
  or the file is rejected as damaged.

The user opens the result with **File → Open file…**, or by dragging the file onto the canvas.

---

## 2. `manifest.json`

```json
{
  "kind": "openframe-package",
  "version": 1,
  "images": [
    { "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "mime": "image/png", "width": 160, "height": 120 }
  ]
}
```

- `kind` and `version` are constants. Any other value is refused as "made by a newer version".
- `images` is `[]` when the design has no images.
- `hash` is 64 lowercase hex characters.
- `mime` starts with `image/` or `video/` (≤ 100 characters). The renderer decodes `image/png`,
  `image/jpeg`, `image/webp` and `image/gif` directly — prefer PNG or JPEG.
- `width` and `height` are the image's **pixel** dimensions, positive integers. Keep the longest side
  at 4096 px or less, which is what the app's own importer does.

---

## 3. `document.json`

```json
{
  "format": "openframe",
  "version": 1,
  "meta": { "name": "Generated", "createdAt": "2026-09-18T10:00:00.000Z", "appVersion": "generator" },
  "nodes": {
    "0:0":    { "id": "0:0", "type": "DOCUMENT", "name": "Generated" },
    "gen1:1": { "id": "gen1:1", "type": "PAGE", "name": "Page 1", "parent": { "id": "0:0", "key": "V" },
                "visible": true, "locked": false, "backgroundColor": { "r": 0.96, "g": 0.96, "b": 0.96, "a": 1 } }
  }
}
```

- `format` and `version` are constants (`"openframe"`, `1`).
- `meta.name` is the file name shown in the app; `createdAt` is any string (use an ISO date);
  `appVersion` is any string.
- `nodes` is a **flat map, id → node**. There is no nesting: the tree lives in each node's `parent`
  field. The map key must equal the node's own `id`.
- The JSON may be pretty-printed. (The app itself writes canonical JSON — sorted keys, no
  whitespace — so that saves are byte-stable, but the reader accepts any valid JSON.)
- Fields the schema does not know are silently dropped. Do not rely on them; do not add them.

### IDs

Every id is `<replica>:<counter>`:

- `replica`: 1–12 characters of `[0-9a-z]`. Pick one per generated file, e.g. `gen1` or a random
  base-36 string. It keeps ids from colliding with ids made in the app.
- `counter`: a non-negative integer, unique within the replica. A simple 1, 2, 3… is fine.
- `0:0` is reserved for the `DOCUMENT` root.

Invalid shapes (`GEN-1:3`, `uuid`, bare numbers) fail validation.

### Parent and sibling order

Every node except the root carries:

```json
"parent": { "id": "<parent id>", "key": "<order key>" }
```

- Siblings sort by `key` as plain strings; ties break by id.
- **First sibling = painted first = bottom-most.** The layers panel shows the reverse.
- A key is one or more characters of `[0-9A-Za-z]` and **must not end in `0`**.
- To generate `n` ordered keys, take the first `n` of `1 2 3 … 9 A B … Z a b … z` (61 keys). Beyond
  61 siblings, use two-character keys of the same alphabet (all the same length, never ending in
  `0`), e.g. `11`, `12`, …, `1z`, `21`.

### Structural rules (checked after validation)

1. Exactly one `DOCUMENT` node, with id `0:0`, and it has no `parent`.
2. At least one `PAGE`; pages are children of `0:0`.
3. Scene layers are never children of `0:0` — they go on a page, or inside a frame, group, boolean
   group or section.
4. Only `PAGE`, `FRAME`, `GROUP`, `BOOLEAN_OPERATION` and `SECTION` may have children.
5. A `GROUP` or `BOOLEAN_OPERATION` must have at least one child.
6. Sections live on a page or in another section, never inside frames or groups.
7. Every `parent.id` exists, and parent chains never cycle.

---

## 4. Geometry, colour, paint

**Transform.** Every layer has `"transform": [a, b, c, d, tx, ty]` — an affine matrix in
Canvas/DOMMatrix order, relative to the parent. Its `size` is in the layer's own space, before the
transform.

- Place at (x, y): `[1, 0, 0, 1, x, y]`
- Rotate by θ (radians, clockwise on screen) around the layer's origin at (x, y):
  `[cos θ, sin θ, −sin θ, cos θ, x, y]`
- Flip horizontally: negate `a` (and shift `tx` by the width).
- A layer's world matrix is `world(parent) · transform`.

**Colour** is `{ "r", "g", "b", "a" }` with every channel **0–1**, not 0–255. `#FFC400` is
`{ "r": 1, "g": 0.7686, "b": 0, "a": 1 }`.

**Paint** (used by `fills` and `strokes`, painted first to last — the last is on top). Every paint
needs `opacity` (0–1), `visible` and `blendMode`:

```json
{ "type": "SOLID", "color": { "r": 0, "g": 0, "b": 0, "a": 1 }, "opacity": 1, "visible": true, "blendMode": "NORMAL" }
```

```json
{ "type": "GRADIENT_LINEAR",
  "gradientStops": [ { "position": 0, "color": { "r": 1, "g": 0, "b": 0, "a": 1 } },
                     { "position": 1, "color": { "r": 0, "g": 0, "b": 1, "a": 1 } } ],
  "gradientTransform": [1, 0, 0, 1, 0, 0], "opacity": 1, "visible": true, "blendMode": "NORMAL" }
```

Gradient space is the layer's unit square: the identity transform gives a left-to-right linear
gradient, or a centred radial one (`GRADIENT_RADIAL`, `GRADIENT_ANGULAR`, `GRADIENT_DIAMOND`).

**Effects** are optional. A drop shadow:

```json
"effects": [ { "type": "DROP_SHADOW", "color": { "r": 0, "g": 0, "b": 0, "a": 0.25 },
               "offset": { "x": 0, "y": 4 }, "radius": 12, "spread": 0,
               "visible": true, "blendMode": "NORMAL", "showShadowBehindNode": false } ]
```

---

## 5. The fields every layer needs

Each scene layer (everything except `DOCUMENT`, `PAGE`, `STYLE`, `VARIABLE*`) must carry **all** of:

```json
{ "id": "gen1:7", "name": "Card", "parent": { "id": "gen1:2", "key": "3" },
  "visible": true, "locked": false,
  "transform": [1, 0, 0, 1, 40, 80], "size": { "width": 200, "height": 120 },
  "opacity": 1, "blendMode": "PASS_THROUGH" }
```

`PASS_THROUGH` is the normal layer blend mode (paints use `NORMAL`).

Layers that paint (`FRAME`, `RECTANGLE`, `ELLIPSE`, `POLYGON`, `STAR`, `LINE`, `VECTOR`,
`BOOLEAN_OPERATION`, `SECTION`, `TEXT`) additionally need all four of:

```json
"fills": [], "strokes": [], "strokeWeight": 1, "strokeAlign": "INSIDE"
```

`strokeAlign` is `INSIDE`, `CENTER` or `OUTSIDE`. Frames and rectangles also require
`"cornerRadius": 0` (any number ≥ 0).

---

## 6. Recipes

Each block below is complete: copy it, change the values, leave nothing out.

### Page

```json
{ "id": "gen1:1", "type": "PAGE", "name": "Page 1", "parent": { "id": "0:0", "key": "V" },
  "visible": true, "locked": false,
  "backgroundColor": { "r": 0.9608, "g": 0.9608, "b": 0.9608, "a": 1 } }
```

### Frame (an artboard, and the only container that clips)

```json
{ "id": "gen1:2", "type": "FRAME", "name": "Poster", "parent": { "id": "gen1:1", "key": "1" },
  "visible": true, "locked": false,
  "transform": [1, 0, 0, 1, 0, 0], "size": { "width": 800, "height": 600 },
  "opacity": 1, "blendMode": "PASS_THROUGH",
  "fills": [ { "type": "SOLID", "color": { "r": 1, "g": 1, "b": 1, "a": 1 }, "opacity": 1, "visible": true, "blendMode": "NORMAL" } ],
  "strokes": [], "strokeWeight": 1, "strokeAlign": "INSIDE",
  "cornerRadius": 0, "clipsContent": true }
```

A frame's children are positioned in the **frame's** space, so a child at `[1,0,0,1,48,48]` sits
48 px in from the frame's top-left wherever the frame is.

Auto layout is optional and only worth adding if you want the app to keep the children laid out:
add `"layoutMode": "VERTICAL"` (or `"HORIZONTAL"`), `"itemSpacing"`, and the four `padding*` fields.
If you do, position the children consistently with that layout — the editor re-lays them out on the
first edit.

### Rectangle

```json
{ "id": "gen1:7", "type": "RECTANGLE", "name": "Card", "parent": { "id": "gen1:2", "key": "4" },
  "visible": true, "locked": false,
  "transform": [1, 0, 0, 1, 440, 240], "size": { "width": 200, "height": 120 },
  "opacity": 1, "blendMode": "PASS_THROUGH",
  "fills": [ { "type": "SOLID", "color": { "r": 0.851, "g": 0.851, "b": 0.851, "a": 1 }, "opacity": 1, "visible": true, "blendMode": "NORMAL" } ],
  "strokes": [], "strokeWeight": 1, "strokeAlign": "INSIDE",
  "cornerRadius": 8 }
```

Per-corner radii: `"cornerRadii": { "topLeft": 8, "topRight": 8, "bottomRight": 0, "bottomLeft": 0 }`.

### Ellipse

Same as a rectangle, `"type": "ELLIPSE"`, **without** `cornerRadius`. A circle is an ellipse with
equal width and height. For a pie or ring add
`"arcData": { "startingAngle": 0, "endingAngle": 3.1416, "innerRadius": 0.4 }` (radians, clockwise
from the right-hand point; `innerRadius` is 0–1 of the radius).

### Polygon and star

```json
{ "...": "scene + fills/strokes/strokeWeight/strokeAlign",
  "type": "STAR", "pointCount": 5, "innerRadius": 0.38 }
```

`POLYGON` takes `pointCount` only (3–60). Vertices are scaled so their bounds fill the layer box.

### Text

```json
{ "id": "gen1:3", "type": "TEXT", "name": "Openframe", "parent": { "id": "gen1:2", "key": "1" },
  "visible": true, "locked": false,
  "transform": [1, 0, 0, 1, 48, 48], "size": { "width": 260, "height": 58 },
  "opacity": 1, "blendMode": "PASS_THROUGH",
  "fills": [ { "type": "SOLID", "color": { "r": 0.067, "g": 0.067, "b": 0.067, "a": 1 }, "opacity": 1, "visible": true, "blendMode": "NORMAL" } ],
  "strokes": [], "strokeWeight": 1, "strokeAlign": "OUTSIDE",
  "characters": "Openframe",
  "fontName": { "family": "Inter", "style": "Bold" },
  "fontSize": 48,
  "lineHeight": { "unit": "AUTO" },
  "letterSpacing": { "unit": "PERCENT", "value": 0 },
  "textAlignHorizontal": "LEFT", "textAlignVertical": "TOP",
  "textAutoResize": "WIDTH_AND_HEIGHT" }
```

- **Fonts.** The whole **Google Fonts library ships with the app** — 1,946 families, every style and
  every subset — alongside **Inter** and **Noto Sans SC / TC / JP / KR** (see
  [`docs/FONTS.md`](FONTS.md)). So any Google family may be named and it will draw; a family that is
  in neither loads but is reported as a missing font. `style` is one of `Thin`, `Extra Light`,
  `Light`, `Regular`, `Medium`, `Semi Bold`, `Bold`, `Extra Bold`, `Black`, each also as `… Italic`
  (plain `Italic` for 400).
  - **Inter for interface text.** It is what the app itself is drawn in, and it is loaded already.
  - **Source Code Pro for code**, and for anything else that must line up in columns — a terminal, a
    diff, a table of figures, a licence key. Never set code in Inter: a proportional font takes the
    alignment out of it, and `l`, `1` and `I` stop being told apart.

    ```json
    { "fontName": { "family": "Source Code Pro", "style": "Regular" }, "fontSize": 13,
      "lineHeight": { "unit": "PERCENT", "value": 150 } }
    ```

    Its weights are `ExtraLight` through `Black`; `Medium` or `SemiBold` reads well for a keyword
    run inside a code block, set with `styleRuns`. `Roboto Mono`, `JetBrains Mono`, `IBM Plex Mono`
    and `Fira Code` are all there too if a house style asks for one; 51 monospace families are.
- **Sizing.** `textAutoResize` is `WIDTH_AND_HEIGHT` (auto width: one line per `\n`), `HEIGHT`
  (fixed width, wraps, height follows), `NONE` (fixed box, may overflow) or `TRUNCATE` (fixed box,
  ellipsis).
  - For paragraphs prefer `HEIGHT`: set `size.width` to the wrap width; the height is corrected the
    first time the layer is touched in the app.
  - For `WIDTH_AND_HEIGHT` the renderer measures the text itself, so an approximate `size` still
    draws correctly. Estimate `width ≈ 0.55 × fontSize × longest line length` and
    `height ≈ 1.21 × fontSize × line count` for Inter, and keep
    `textAlignHorizontal: "LEFT"`, `textAlignVertical: "TOP"` so a wrong estimate cannot shift the
    text.
  - **Monospace is exact, so use it.** Every character of Source Code Pro is the same width, so the
    box can be worked out rather than guessed: `width = 0.6 × fontSize × longest line length` and
    `height = 1.26 × fontSize × line count`. (Measured in the app: 20 characters at 100 px come to
    1200 × 126.) A code block of 48 columns at 13 px is `374.4` wide.
- `lineHeight` is `{ "unit": "AUTO" }`, `{ "unit": "PIXELS", "value": 24 }` or
  `{ "unit": "PERCENT", "value": 150 }`. `letterSpacing` is `PIXELS` or `PERCENT`.
- Newlines in `characters` start new paragraphs. Optional extras: `paragraphSpacing`,
  `textDecoration` (`UNDERLINE`), `textCase` (`UPPER`), `maxLines`,
  `listType` (`UNORDERED` / `ORDERED`).
- Mixed styling within one layer uses `styleRuns` — sorted, non-overlapping
  `{ "start", "end", "style": { … } }` over UTF-16 offsets. Skip it unless you need it.

### Image

Three things must line up: the bytes in the ZIP, the manifest entry, and the paint.

1. Put the exact bytes at `images/<sha256 of those bytes>`.
2. List `{ hash, mime, width, height }` in `manifest.json`.
3. Give a layer an image fill. Images are fills, not a layer type — the app places them as a
   rectangle at the image's pixel size:

```json
{ "id": "gen1:5", "type": "RECTANGLE", "name": "Photo", "parent": { "id": "gen1:2", "key": "3" },
  "visible": true, "locked": false,
  "transform": [1, 0, 0, 1, 48, 240], "size": { "width": 320, "height": 240 },
  "opacity": 1, "blendMode": "PASS_THROUGH",
  "fills": [ { "type": "IMAGE", "imageHash": "<the same hash>",
               "imageSize": { "width": 160, "height": 120 },
               "scaleMode": "FILL", "opacity": 1, "visible": true, "blendMode": "NORMAL" } ],
  "strokes": [], "strokeWeight": 1, "strokeAlign": "INSIDE",
  "cornerRadius": 12 }
```

- `imageSize` is the image's pixel size (the same numbers as the manifest); `size` is how big the
  layer is on the canvas.
- `scaleMode`: `FILL` (covers, cropping), `FIT` (contains), `CROP` (with an `imageTransform`), `TILE`
  (with a `scalingFactor`).
- Image fills work on `RECTANGLE`, `ELLIPSE`, `POLYGON` and `STAR`.
- A fill whose `imageHash` is not in the package still loads — it draws as an empty placeholder. A
  hash listed in the manifest but missing from the ZIP rejects the whole file.
- Video is the same shape: `{ "type": "VIDEO", "videoHash": "…", "imageHash": "<poster png>", … }`,
  with both hashes carried in the package.

### Arrow (straight)

An arrow is a `LINE` with an arrowhead cap. A line runs from its local origin along +x, so its
`size.height` is **always 0** and its direction comes from the transform:

```json
{ "id": "gen1:9", "type": "LINE", "name": "Arrow", "parent": { "id": "gen1:2", "key": "5" },
  "visible": true, "locked": false,
  "transform": [0.866, 0.5, -0.5, 0.866, 400, 160], "size": { "width": 180, "height": 0 },
  "opacity": 1, "blendMode": "PASS_THROUGH",
  "fills": [], "strokes": [ { "type": "SOLID", "color": { "r": 0, "g": 0, "b": 0, "a": 1 }, "opacity": 1, "visible": true, "blendMode": "NORMAL" } ],
  "strokeWeight": 2, "strokeAlign": "CENTER",
  "startCap": "NONE", "endCap": "LINE_ARROW" }
```

To draw an arrow from **(x₁, y₁) to (x₂, y₂)** in the parent's space:

```
dx = x₂ − x₁,  dy = y₂ − y₁,  θ = atan2(dy, dx)
transform = [cos θ, sin θ, −sin θ, cos θ, x₁, y₁]
size      = { width: hypot(dx, dy), height: 0 }
```

Caps (`startCap`, `endCap`): `NONE`, `ROUND`, `SQUARE`, `LINE_ARROW`, `TRIANGLE_ARROW`,
`TRIANGLE_FILLED`, `CIRCLE_FILLED`, `DIAMOND_FILLED`. A dashed arrow adds
`"strokeDashes": [8, 6]`.

### Curved arrow / any path (vector)

```json
{ "id": "gen1:10", "type": "VECTOR", "name": "Curve", "parent": { "id": "gen1:2", "key": "6" },
  "visible": true, "locked": false,
  "transform": [1, 0, 0, 1, 560, 80], "size": { "width": 160, "height": 100 },
  "opacity": 1, "blendMode": "PASS_THROUGH",
  "fills": [], "strokes": [ { "type": "SOLID", "color": { "r": 0.08, "g": 0.35, "b": 0.78, "a": 1 }, "opacity": 1, "visible": true, "blendMode": "NORMAL" } ],
  "strokeWeight": 3, "strokeAlign": "CENTER",
  "vectorNetwork": {
    "vertices": [ { "x": 0, "y": 100 }, { "x": 160, "y": 0 } ],
    "segments": [ { "start": 0, "end": 1, "tangentStart": { "x": 80, "y": 0 }, "tangentEnd": { "x": -80, "y": 0 } } ],
    "regions": []
  },
  "endpointCap": "TRIANGLE_FILLED" }
```

- Coordinates are in the layer's local space and should span its `size` (the network is scaled with
  the box when the layer is resized).
- `start` and `end` are **indices into `vertices`**. Nothing checks them: an out-of-range index
  loads happily and then breaks rendering. Check them yourself.
- `tangentStart` / `tangentEnd` are the Bézier control points as **offsets from** the segment's start
  and end vertices. Both `{ "x": 0, "y": 0 }` makes a straight segment.
- `endpointCap` caps every open end of the network.
- A closed, fillable shape needs a `region`: list the segment indices of each loop, e.g.
  `"regions": [ { "loops": [[0, 1, 2]], "windingRule": "NONZERO" } ]`, and give the layer `fills`.

### Group

A group is a bare container — no fills, no clipping — and it **must not be empty**:

```json
{ "id": "gen1:6", "type": "GROUP", "name": "Badges", "parent": { "id": "gen1:2", "key": "4" },
  "visible": true, "locked": false,
  "transform": [1, 0, 0, 1, 0, 0], "size": { "width": 200, "height": 240 },
  "opacity": 1, "blendMode": "PASS_THROUGH" }
```

Keep the group's transform at the identity and position its children in the parent's coordinates —
then the children's numbers read the same as if they were ungrouped. The group's `size` is
informational in format version 1.

---

## 7. A complete, working generator

This script produces a file that the app opens. It was run and its output verified through the
app's own `readPackage`. Run it from the repository root (it uses the repo's `fflate`), or
`npm i fflate` anywhere else.

```js
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { zipSync } from 'fflate';

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** `n` ascending sibling order keys, none ending in "0". */
const orderKeys = (n) =>
  n <= 61
    ? Array.from({ length: n }, (_, i) => DIGITS[i + 1])
    : Array.from({ length: n }, (_, i) => DIGITS[1 + Math.floor(i / 61)] + DIGITS[1 + (i % 61)]);

const REPLICA = 'gen1';
let counter = 0;
const nextId = () => `${REPLICA}:${++counter}`;

const rgb = (r, g, b, a = 1) => ({ r: r / 255, g: g / 255, b: b / 255, a });
const solid = (color) => ({ type: 'SOLID', color, opacity: 1, visible: true, blendMode: 'NORMAL' });
const at = (x, y) => [1, 0, 0, 1, x, y];
/** A line/arrow transform: start point plus a direction in degrees. */
const rotated = (x, y, deg) => {
  const t = (deg * Math.PI) / 180;
  return [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), x, y];
};
const base = (id, parent, key, name, x, y, width, height) => ({
  id, name, parent: { id: parent, key },
  visible: true, locked: false,
  transform: at(x, y), size: { width, height },
  opacity: 1, blendMode: 'PASS_THROUGH',
});
const stroke = { strokes: [], strokeWeight: 1, strokeAlign: 'INSIDE' };

const nodes = {};
const add = (node) => (nodes[node.id] = node).id;

const ROOT = '0:0';
add({ id: ROOT, type: 'DOCUMENT', name: 'Generated' });

const pageId = nextId();
add({ id: pageId, type: 'PAGE', name: 'Page 1', parent: { id: ROOT, key: 'V' },
      visible: true, locked: false, backgroundColor: rgb(245, 245, 245) });

const frameId = nextId();
add({ ...base(frameId, pageId, orderKeys(1)[0], 'Poster', 0, 0, 800, 600),
      type: 'FRAME', fills: [solid(rgb(255, 255, 255))], ...stroke,
      cornerRadius: 0, clipsContent: true });

const k = orderKeys(8);
let i = 0;

// Heading
add({ ...base(nextId(), frameId, k[i++], 'Openframe', 48, 48, 260, 58),
      type: 'TEXT', fills: [solid(rgb(17, 17, 17))],
      strokes: [], strokeWeight: 1, strokeAlign: 'OUTSIDE',
      characters: 'Openframe',
      fontName: { family: 'Inter', style: 'Bold' }, fontSize: 48,
      lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PERCENT', value: 0 },
      textAlignHorizontal: 'LEFT', textAlignVertical: 'TOP',
      textAutoResize: 'WIDTH_AND_HEIGHT' });

// Paragraph: fixed width, height follows the text
add({ ...base(nextId(), frameId, k[i++], 'Body', 48, 124, 360, 60),
      type: 'TEXT', fills: [solid(rgb(85, 85, 85))],
      strokes: [], strokeWeight: 1, strokeAlign: 'OUTSIDE',
      characters: 'A generated document: text, an image, shapes and an arrow.',
      fontName: { family: 'Inter', style: 'Regular' }, fontSize: 16,
      lineHeight: { unit: 'PERCENT', value: 150 }, letterSpacing: { unit: 'PERCENT', value: 0 },
      textAlignHorizontal: 'LEFT', textAlignVertical: 'TOP',
      textAutoResize: 'HEIGHT', paragraphSpacing: 8 });

// Image: bytes → hash → manifest entry → image fill
const bytes = new Uint8Array(readFileSync('photo.png'));
const hash = createHash('sha256').update(bytes).digest('hex');
const imagePixels = { width: 160, height: 120 }; // the file's real pixel size
add({ ...base(nextId(), frameId, k[i++], 'Photo', 48, 240, 320, 240),
      type: 'RECTANGLE',
      fills: [{ type: 'IMAGE', imageHash: hash, imageSize: imagePixels,
                scaleMode: 'FILL', opacity: 1, visible: true, blendMode: 'NORMAL' }],
      ...stroke, cornerRadius: 12 });

// A group of two shapes (a group is never empty)
const groupId = nextId();
add({ ...base(groupId, frameId, k[i++], 'Badges', 0, 0, 200, 240), type: 'GROUP' });
const gk = orderKeys(2);
add({ ...base(nextId(), groupId, gk[0], 'Card', 440, 240, 200, 120),
      type: 'RECTANGLE', fills: [solid(rgb(217, 217, 217))], ...stroke, cornerRadius: 8 });
add({ ...base(nextId(), groupId, gk[1], 'Dot', 440, 380, 100, 100),
      type: 'ELLIPSE', fills: [solid(rgb(255, 99, 71))], ...stroke });

// Arrow: a LINE, 180 long, pointing 30° down-right from (400, 160)
add({ ...base(nextId(), frameId, k[i++], 'Arrow', 0, 0, 180, 0),
      transform: rotated(400, 160, 30),
      type: 'LINE', fills: [], strokes: [solid(rgb(0, 0, 0))],
      strokeWeight: 2, strokeAlign: 'CENTER',
      startCap: 'NONE', endCap: 'LINE_ARROW' });

// Curved arrow
add({ ...base(nextId(), frameId, k[i++], 'Curve', 560, 80, 160, 100),
      type: 'VECTOR', fills: [], strokes: [solid(rgb(20, 90, 200))],
      strokeWeight: 3, strokeAlign: 'CENTER',
      vectorNetwork: {
        vertices: [{ x: 0, y: 100 }, { x: 160, y: 0 }],
        segments: [{ start: 0, end: 1, tangentStart: { x: 80, y: 0 }, tangentEnd: { x: -80, y: 0 } }],
        regions: [],
      },
      endpointCap: 'TRIANGLE_FILLED' });

add({ ...base(nextId(), frameId, k[i++], 'Star', 660, 400, 100, 100),
      type: 'STAR', fills: [solid(rgb(255, 196, 0))], ...stroke,
      pointCount: 5, innerRadius: 0.38 });

const doc = {
  format: 'openframe',
  version: 1,
  meta: { name: 'Generated', createdAt: new Date().toISOString(), appVersion: 'generator' },
  nodes,
};
const manifest = {
  kind: 'openframe-package',
  version: 1,
  images: [{ hash, mime: 'image/png', ...imagePixels }],
};

const enc = new TextEncoder();
writeFileSync('generated.openframe', zipSync({
  'manifest.json': enc.encode(JSON.stringify(manifest)),
  'document.json': enc.encode(JSON.stringify(doc)),
  [`images/${hash}`]: [bytes, { level: 0 }], // images are already compressed
}));
```

Any standard ZIP writer works just as well — a package built with Python's `zipfile` reads back
identically:

```python
import hashlib, json, zipfile

img = open('photo.png', 'rb').read()
h = hashlib.sha256(img).hexdigest()
manifest = {'kind': 'openframe-package', 'version': 1,
            'images': [{'hash': h, 'mime': 'image/png', 'width': 160, 'height': 120}]}

with zipfile.ZipFile('generated.openframe', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.json', json.dumps(manifest))
    z.writestr('document.json', json.dumps(document))   # the dict from above
    z.writestr(f'images/{h}', img, zipfile.ZIP_STORED)
```

---

## 8. Check the file before handing it over

**Self-check list** — run through it mentally, it catches almost every failure:

- [ ] `format: "openframe"`, `version: 1`, `meta` present with three string fields.
- [ ] One `DOCUMENT` node, id `0:0`, no `parent`. At least one `PAGE`, parented to `0:0`.
- [ ] Every map key equals its node's `id`; every id matches `<1–12 chars of [0-9a-z]>:<digits>`.
- [ ] Every non-root node has `parent.id` pointing at an existing node that is allowed to have
      children, and a `parent.key` that does not end in `0`.
- [ ] No empty `GROUP` or `BOOLEAN_OPERATION`.
- [ ] Every scene layer has `transform`, `size`, `opacity`, `blendMode`, `visible`, `locked`, `name`.
- [ ] Every painting layer has all four of `fills`, `strokes`, `strokeWeight`, `strokeAlign`;
      frames and rectangles also `cornerRadius`; frames also `clipsContent`.
- [ ] Colour channels are 0–1. Every paint has `opacity`, `visible`, `blendMode`.
- [ ] Text layers carry `characters`, `fontName`, `fontSize`, `lineHeight`, `letterSpacing`,
      `textAlignHorizontal`, `textAlignVertical`, `textAutoResize`.
- [ ] Code, terminal output and anything that lines up in columns is set in **Source Code Pro**, not
      in Inter, and its box is `0.6 × fontSize × columns` wide.
- [ ] `LINE` layers have `size.height === 0`, `startCap` and `endCap`.
- [ ] Vector segment `start`/`end` are valid vertex indices.
- [ ] Every manifest image is in the ZIP and hashes to its entry name; every `imageHash` in the
      document is either in the manifest or knowingly left as a placeholder.

**Programmatic check** (inside this repository) — the fastest way to be certain:

```ts
import { readFileSync } from 'node:fs';
import { readPackage } from '@/platform/package';

const { store, images } = await readPackage(new Uint8Array(readFileSync('generated.openframe')));
console.log(store.pages().length, [...store.nodes()].length, images.length);
```

Put that in a `*.test.ts` under `tests/` and run `npx vitest run <file>`. It runs the exact
validation, migration and invariant checks the app runs when opening a file.

**In the app:** File → Open file…, or drag the `.openframe` onto the canvas.

---

## 9. What the errors mean

These are the real messages, with the cause:

| Message | Cause |
|---|---|
| `This file is not an Openframe file.` | Not a ZIP, or `manifest.json` / `document.json` missing |
| `This file was made by a newer version of Openframe, or is damaged.` | `manifest.json` isn't the shape in §2 |
| `The file is damaged: an image (abc12345) is missing.` | Manifest lists a hash with no `images/<hash>` entry |
| `The file is damaged: an image (abc12345) doesn't match its contents.` | Entry name isn't the SHA-256 of its bytes |
| `Not an Openframe document` | `document.json` has no `"format": "openframe"` |
| `This file was created by a newer version of Openframe (format 2).` | `version` is anything but `1` |
| `Document failed validation` + `nodes.gen1:11.size: expected object, received undefined` | A required field is missing — the path names it |
| `Document failed validation` + `nodes.gen1:11.parent.key: invalid order key` | Order key empty or ending in `0` |
| `Document failed validation` + `fills.0.color.r: Too big: expected number to be <=1` | Colours written as 0–255 |
| `Document failed validation` + `nodes.GEN-1:3: Invalid key in record` | Malformed id |
| `Node key gen1:11 does not match id gen1:99` | Map key and `id` disagree |
| `Document structure is invalid` + `group gen1:6 is empty` | A group with no children |
| `Document structure is invalid` + `gen1:2: scene nodes cannot be children of the root` | A layer parented to `0:0` instead of a page |
| `Document structure is invalid` + `document has no pages` | No `PAGE` node |
| `Forbidden key "__proto__" in document` | The JSON contains `__proto__`, `constructor` or `prototype` as a key |

Three things the loader will **not** catch — get them right yourself:

1. **Unknown fields are silently dropped.** A misspelled field is not an error; it simply does
   nothing. Copy field names exactly.
2. **Duplicate sibling keys load.** Order then falls back to comparing ids, which is rarely what
   you meant.
3. **Out-of-range vector indices load** and break rendering afterwards.

---

## 10. Beyond this guide

Everything else in the format — components and instances, variables and styles, auto layout detail,
prototyping interactions, Motion animation, Dev Mode annotations, comments, sections, boolean groups,
masks — is specified field by field in [`docs/DOCUMENT_FORMAT.md`](DOCUMENT_FORMAT.md), and the last
word is always [`src/core/schema/document.ts`](../src/core/schema/document.ts). If a field is not in
one of those two places, it does not exist: writing it produces nothing.
