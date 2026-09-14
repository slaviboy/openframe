# Openframe Document Format

This document specifies format version **1**, which the code in `src/core` implements.
- The zod schema in [`src/core/schema/document.ts`](../src/core/schema/document.ts) is authoritative. This document explains it.
- Format changes must update the schema, add a migration, add a fixture, and update this file in the same change.

## 1. Goals

| Goal | Mechanism |
|---|---|
| Deterministic output | Canonical JSON: sorted keys, `-0` → `0`, no insignificant whitespace |
| Stable identity | Replica-scoped IDs `<replica>:<counter>` that never collide across tabs, sessions, or files |
| Cheap reordering and merging | Fractional-index sibling keys; a reorder is a single field write |
| Backwards compatibility | Integer `version`, forward-only JSON migrations, frozen fixtures |
| Safety for untrusted input | Schema validation, structural invariants, prototype-pollution guard on parse |
| Incremental persistence | Every change is a small invertible op, journaled between snapshots |

## 2. Top-level structure

```jsonc
{
  "format": "openframe",          // constant
  "version": 1,                   // integer format version
  "meta": {
    "name": "Untitled",
    "createdAt": "2026-09-13T12:00:00.000Z",
    "appVersion": "0.1.0"
  },
  "nodes": {                      // flat map: id → node
    "0:0": { "id": "0:0", "type": "DOCUMENT", "name": "Untitled" },
    "k3f9x2:1": { "id": "k3f9x2:1", "type": "PAGE", ... },
    ...
  }
}
```

The document is a **flat map of nodes**. The tree is encoded by each node's `parent` reference, not by nesting. As a result:
- lookups are O(1)
- ops touch one entity
- diffs and merges compare entities independently

Later versions add sibling maps (`styles`, `variables`, `variableCollections`, `annotationCategories`, …) using the same pattern.

## 3. Identifiers

```
<replica>:<counter>        e.g.  k3f9x2abcd:42
```

- `replica` is 1–12 characters of `[0-9a-z]`. It is generated randomly (48 bits) once per editing session by `platform/replica.ts`.
- `counter` is a non-negative integer, monotonic within the replica. When a document loads, the generator observes existing IDs, so a reused replica never repeats a counter.
- `0:0` is reserved for the `DOCUMENT` root.

The format is validated by `IdSchema` and `isId`.

## 4. Tree structure and ordering

Every node except the root has:

```jsonc
"parent": { "id": "<parent id>", "key": "<fractional index>" }
```

**Sibling order**
- Siblings sort by `key` (plain string comparison), with ties broken by `id`.
- Order is **back to front**: the first child is painted first (bottom-most). The layers panel lists children in reverse.

**Keys** (see [`src/core/ids/fractional-index.ts`](../src/core/ids/fractional-index.ts))
- Keys are base-62 digit strings that act as fractions in (0, 1).
- `keyBetween(a, b)` always produces a key strictly between its arguments.
- A key never ends in `0`, so a smaller key can always be generated.
- Reordering or reparenting a node is a single `set` of its `parent` field.

**Structural invariants** (see [`src/core/document/invariants.ts`](../src/core/document/invariants.ts))
1. Exactly one `DOCUMENT` node, with id `0:0`.
2. At least one `PAGE`. Pages are children of the root.
3. Scene nodes are never direct children of the root.
4. Only `PAGE`, `FRAME` and `GROUP` nodes have children.
5. Groups are never empty.
6. Parent chains are acyclic and every parent exists.

## 5. Node types (v1)

### Common fields

| Field | Type | Notes |
|---|---|---|
| `id` | Id | Immutable |
| `type` | string | Discriminant; immutable |
| `name` | string (≤ 10,000 chars) | Layer name |
| `parent` | `{ id, key }` | Absent only on `DOCUMENT` |
| `visible` | boolean | Hidden layers are not rendered or hit-testable |
| `locked` | boolean | Locked layers cannot be selected on the canvas; children inherit the lock |

### Scene node fields (`FRAME`, `GROUP`, `RECTANGLE`, `ELLIPSE`, `POLYGON`, `STAR`, `LINE`)

| Field | Type | Notes |
|---|---|---|
| `transform` | `[a, b, c, d, tx, ty]` | Affine transform relative to the parent, in Canvas/DOMMatrix order. Encodes position, rotation and flips. |
| `size` | `{ width, height }` (≥ 0) | Size in the node's local space, before the transform |
| `opacity` | 0–1 | Layer opacity |
| `effects` | `Effect[]` (optional, ≤ 64) | Shadows and blurs, absent when there are none. `DROP_SHADOW` / `INNER_SHADOW`: `color` (alpha = opacity), `offset {x, y}`, `radius` (blur, ≥ 0), `spread`, `visible`, `blendMode`; drop shadows add `showShadowBehindNode`. `LAYER_BLUR` / `BACKGROUND_BLUR`: `radius`, `visible`, and for progressive blurs `blurType: "PROGRESSIVE"`, `startRadius` (radius at the start), `startOffset {x, y}` and `endOffset {x, y}` (fractions 0–1 of the layer box; `radius` applies at the end). Absent `blurType` means uniform. `NOISE`: `noiseType` (`MONOTONE` \| `DUOTONE` \| `MULTITONE`), `noiseSize` (0.1–100 px), `density` (0–1), `color` and `secondaryColor` (alpha = opacity; mono uses `color`, duo both), `opacity` (multi), `visible`, `blendMode`. `TEXTURE`: `noiseSize` (0.1–100 px), `radius` (0–100 px), `clipToShape`, `visible`. `GLASS`: `lightIntensity` (0–1), `lightAngle` (−180–180°, 0 = light from the right, 90 = from the top), `refraction` (0–1), `depth` (px), `dispersion` (0–1), `radius` (frost blur, px), `splay` (0–1), `visible`. |
| `constrainProportions` | `true` (optional) | Present only when on: width and height edits keep the aspect ratio, and handle resizes keep it unless Shift is held |
| `isMask` | `true` (optional) | The layer is a mask for the siblings above it (later in paint order), up to the next mask. A hidden mask masks nothing. |
| `maskType` | `"VECTOR"` \| `"LUMINANCE"` (optional) | How a mask reveals content: absent is alpha (mask opacity), `VECTOR` treats any coverage as opaque, `LUMINANCE` uses brightness |
| `blendMode` | enum | `PASS_THROUGH` (the layer default) or one of `NORMAL`, `DARKEN`, `MULTIPLY`, `PLUS_DARKER`, `COLOR_BURN`, `LIGHTEN`, `SCREEN`, `PLUS_LIGHTER`, `COLOR_DODGE`, `OVERLAY`, `SOFT_LIGHT`, `HARD_LIGHT`, `DIFFERENCE`, `EXCLUSION`, `HUE`, `SATURATION`, `COLOR`, `LUMINOSITY` |

A node's world matrix is the product of its ancestors' transforms: `world(parent) · transform`.

**Inspector rotation** is shown in degrees, counterclockwise positive: `−atan2(b, a)`, computed after removing any flip.

### Geometry fields (`FRAME`, `RECTANGLE`, `ELLIPSE`, `POLYGON`, `STAR`, `LINE`)

| Field | Type | Notes |
|---|---|---|
| `fills` | `Paint[]` (≤ 256) | Painted first to last (the last paint is on top) |
| `strokes` | `Paint[]` (≤ 256) | |
| `strokeWeight` | number ≥ 0 | |
| `strokeAlign` | `INSIDE` \| `CENTER` \| `OUTSIDE` | |
| `strokeDashes` | `number[]` (optional, 2–32 values ≥ 0) | Alternating dash and gap lengths; absent for a solid stroke. Dashes start with a half-length dash. |
| `strokeCap` | `NONE` \| `ROUND` \| `SQUARE` (optional) | Cap of each dash; absent means `NONE` |
| `strokeJoin` | `MITER` \| `BEVEL` \| `ROUND` (optional) | Absent means `MITER` |
| `strokeMiterAngle` | degrees 0–180 (optional) | Corners sharper than this bevel instead of mitering; absent means 28.96 |

Frames and rectangles also accept `individualStrokeWeights: { top, right, bottom, left }` (optional, each ≥ 0). When present it replaces `strokeWeight` per side; it is removed again when all four sides are equal.

### Corner fields (`FRAME`, `RECTANGLE`)

| Field | Type | Notes |
|---|---|---|
| `cornerRadius` | number ≥ 0 | Uniform radius |
| `cornerRadii` | `{ topLeft, topRight, bottomRight, bottomLeft }` | Optional. When present it overrides `cornerRadius`. Radii are clamped to half the shorter side when rendering. |
| `cornerSmoothing` | 0–1 (optional) | Continuous-curvature ("squircle") corners; 0.6 is the iOS preset. Absent means circular corners. Also allowed on `POLYGON` and `STAR`. |

### Per-type fields

| Type | Extra fields |
|---|---|
| `DOCUMENT` | `id: "0:0"`, `name`, optional `colorProfile` (`"SRGB"` \| `"DISPLAY_P3"`; absent means sRGB): how every color value in the file is interpreted |
| `PAGE` | `backgroundColor: Color` (canvas color); optional `guides: Guide[]` in world coordinates |
| `FRAME` | `clipsContent: boolean`; optional `guides: Guide[]` in the frame's local space (used for frames on the page or in a section) |

A `Guide` is `{ "axis": "X" | "Y", "offset": number }`: `X` guides are vertical lines at x = offset, `Y` guides horizontal lines at y = offset. The field is absent when a page or frame has no guides.
| `GROUP` | none; its `size` is informational in v1 |
| `RECTANGLE` | corner fields |
| `ELLIPSE` | none beyond geometry fields |
| `POLYGON` | `pointCount`: integer 3–60. Vertices of a regular polygon (first vertex at the top) scaled so their bounds fill `size`. Optional `cornerRadius` (≥ 0) rounds every vertex. |
| `STAR` | `pointCount`: integer 3–60; `innerRadius`: 0–1, the inner/outer radius ratio. The outer vertices' bounds fill `size`. Optional `cornerRadius` (≥ 0) rounds every vertex. |
| `LINE` | `startCap`, `endCap`: `NONE` \| `ROUND` \| `SQUARE` \| `LINE_ARROW` \| `TRIANGLE_ARROW` \| `CIRCLE_FILLED` \| `DIAMOND_FILLED`. The line runs from local `(0, 0)` to `(size.width, 0)`; direction comes from `transform`, `size.height` is always 0, and strokes are drawn on center regardless of `strokeAlign`. |
| `TEXT` | Geometry fields (fills color the glyphs) plus:<br>• `characters`: the text, UTF-16, line breaks as `\n`<br>• `fontName`: `{ family, style }`, e.g. `{ "family": "Inter", "style": "Semi Bold Italic" }`<br>• `fontSize`: 1–10000<br>• `lineHeight`: `{ "unit": "AUTO" }`, `{ "unit": "PIXELS", "value" }` or `{ "unit": "PERCENT", "value" }` (of the font size)<br>• `letterSpacing`: `{ "unit": "PIXELS" \| "PERCENT", "value" }`<br>• `textAlignHorizontal`: `LEFT` \| `CENTER` \| `RIGHT` \| `JUSTIFIED`<br>• `textAlignVertical`: `TOP` \| `CENTER` \| `BOTTOM`<br>• `textAutoResize`: `WIDTH_AND_HEIGHT` (auto width) \| `HEIGHT` (auto height) \| `NONE` (fixed size) \| `TRUNCATE`<br>• optional `autoRename` (the name follows the first line until the layer is renamed)<br>• optional `textDecoration`: `UNDERLINE` \| `STRIKETHROUGH` (absent: none)<br>• optional `textCase`: `UPPER` \| `LOWER` \| `TITLE` \| `SMALL_CAPS` (absent: as typed; applied when displaying, the characters stay as typed)<br>• optional `maxLines`: integer ≥ 1; auto height and truncated text is cut off after that many lines with an ellipsis<br>• optional `paragraphSpacing`: pixels between paragraphs (absent: 0)<br>• optional `paragraphIndent`: first-line indent of every paragraph in pixels, applied to left-aligned and justified text only (absent: 0)<br>• optional `listType`: `UNORDERED` (bulleted) \| `ORDERED` (numbered); the default list of every paragraph (absent: no list)<br>• optional `indentation`: list level 1–5 (absent: 1)<br>• optional `listSpacing`: pixels between consecutive list items, used instead of paragraph spacing (absent: 0)<br>• optional `hyperlink`: `{ "type": "URL", "value" }`, a link on the whole text; `value` is an `http://` or `https://` address of at most 2048 characters<br>• optional `openTypeFeatures`: an object of four-character lowercase feature tags to `true` (on) or `false` (off), e.g. `{ "tnum": true, "kern": false }`; tags not listed use the font's default (ligatures, contextual alternates and kerning on, everything else off), and settings equal to the default are not stored<br>• optional `fontVariations`: an object of four-character variation axis tags to numbers, e.g. `{ "wght": 540, "wdth": 85 }`; `wght` overrides the weight from `fontName.style`, and absent axes use the font's default<br>• optional `textDirection`: `LTR` \| `RTL` \| `AUTO`, the default direction of every paragraph (absent or `AUTO`: detected from the paragraph's first letter)<br>• optional `styleRuns`: mixed styles as `{ start, end, style }` runs over UTF-16 offsets [start, end). `style` may override `fontName`, `fontSize`, `lineHeight`, `letterSpacing`, `fills`, `textDecoration`, `textCase`, `listType`, `indentation`, `hyperlink` (`null` for characters without the layer's link) and `openTypeFeatures` and `fontVariations` (each the complete settings of those characters), and `textDirection`. A paragraph's list type, indentation and direction come from its first character (for an empty paragraph, the line break before it); the layer's own fields are the default for everything else. Runs are sorted, don't overlap, adjacent runs with equal overrides are merged, and overrides equal to the default are omitted, so uniform text has no `styleRuns`.<br>Auto width and auto height sizes are kept fitted to the text by the editor at every commit. |

| `SECTION` | geometry fields (fill and border). Never rotated or flipped; does not clip. |
| `SLICE` | none beyond scene fields. An export region that is never rendered. |

`POLYGON`, `STAR`, `LINE`, `SECTION` and `SLICE` were added to format version 1 as new union members, so no migration is needed.

### Containment

[`core/document/containment.ts`](../src/core/document/containment.ts) defines which types may be direct children of which. Invariants, clipboard validation, paste, layer drag and drop, and canvas reparenting all use it.

| Parent | Allowed children |
|---|---|
| `DOCUMENT` | `PAGE` |
| `PAGE`, `SECTION` | every layer type, including `SECTION` |
| `FRAME`, `GROUP` | every layer type except `SECTION` |
| other layers | none |

### Color and Paint

```jsonc
// Color: non-premultiplied sRGB, channels 0–1
{ "r": 0.051, "g": 0.6, "b": 1, "a": 1 }

// Solid paint
{ "type": "SOLID", "color": Color, "opacity": 1, "visible": true, "blendMode": "NORMAL" }

// Gradient paint: type is GRADIENT_LINEAR | GRADIENT_RADIAL | GRADIENT_ANGULAR | GRADIENT_DIAMOND
{
  "type": "GRADIENT_LINEAR",
  "gradientStops": [{ "position": 0, "color": Color }, { "position": 1, "color": Color }], // 2–64 stops, position 0–1
  "gradientTransform": [1, 0, 0, 1, 0, 0],
  "opacity": 1, "visible": true, "blendMode": "NORMAL"
}

// Image paint
{
  "type": "IMAGE",
  "imageHash": "9f86d081…",                // optional; lowercase hex SHA-256 of the stored bytes
  "imageSize": { "width": 640, "height": 480 }, // optional; pixel size of the stored image
  "scaleMode": "FILL",                      // FILL | FIT | CROP | TILE
  "imageTransform": [1, 0, 0, 1, 0, 0],     // optional; CROP only
  "scalingFactor": 1,                       // optional; TILE only
  "rotation": 90,                           // optional; 90 | 180 | 270, clockwise
  "filters": { "exposure": 0.4, "shadows": -0.2 }, // optional; each −1–1, zero values omitted
                                            // keys: exposure, contrast, saturation, temperature, tint, highlights, shadows
  "opacity": 1, "visible": true, "blendMode": "NORMAL"
}
```

- Stop colors carry their own alpha; `opacity` applies to the whole paint.
- Gradients are defined in a unit gradient space: linear runs from (0, ½) to (1, ½); radial, angular and diamond are centered at (½, ½) with radius ½. `gradientTransform` maps gradient space onto the layer's unit square (0–1 on both axes), so the identity is a left-to-right linear gradient, or a centered radial/angular/diamond gradient that fills the layer.
- Image bytes are not part of the document. `imageHash` addresses them in a content-addressed image store (see §9). An image paint without a hash is a placeholder and renders as a checkerboard, as does a hash whose bytes are not available.
- Image placement ([`core/image/image-fit.ts`](../src/core/image/image-fit.ts)):
  - `FILL` scales the image, after `rotation`, to cover the layer, centered.
  - `FIT` scales it to fit entirely inside the layer, centered.
  - `TILE` repeats it from the layer origin at `scalingFactor` × its pixel size.
  - `CROP` maps the layer's unit square into the image's unit square with `imageTransform`, ignoring `rotation`.
- Pattern paint:
  - Fields: `{ "type": "PATTERN", "sourceNodeId"?: Id, "tileType": "RECTANGULAR" | "HORIZONTAL_HEXAGONAL" | "VERTICAL_HEXAGONAL", "scalingFactor": 0.01–100, "spacing": { "x", "y" } (px), "horizontalAlignment": "START" | "CENTER" | "END", "opacity", "visible", "blendMode" }`.
  - The source layer's content, drawn in its own coordinates, is scaled by `scalingFactor` and repeated with `spacing` between tiles.
  - Hexagonal tiles shift every other row or column by half a tile.
  - A missing `sourceNodeId`, a deleted source, or a source that is the layer itself renders nothing.
- Video paints arrive later as a new union member.

## 6. Serialization

**Writing:** `serializeDocument(store)` produces canonical JSON.
- Object keys are sorted lexicographically at every depth.
- `undefined` fields are omitted.
- `-0` is written as `0`.
- Non-finite numbers are rejected.

Serializing the same document always yields the same bytes. Unit tests check a byte-identical round trip: `serialize(deserialize(serialize(doc))) === serialize(doc)`.

**Reading:** `deserializeDocument(text)` runs these steps in order:
1. `JSON.parse` with a reviver that rejects `__proto__`, `constructor` and `prototype` keys.
2. Checks that `format === "openframe"`.
3. Migrates to the current version.
4. Validates with `DocumentSchema`. The first 20 issues are reported with their paths.
5. Checks that every map key equals its node's `id`.
6. Builds the store and asserts the structural invariants.

Any failure throws `DocumentLoadError` with a user-presentable message and an issue list. A malformed file never partially loads.

## 7. Migrations

Migrations live in [`src/core/migrations/migrations.ts`](../src/core/migrations/migrations.ts).

- `MIGRATIONS[n]` transforms untyped JSON from version `n` to `n + 1`. The runner then sets `version`.
- Migrations are pure and forward-only. A migration is never edited after release.
- A file with `version` greater than the current version raises `UnsupportedVersionError` ("created by a newer version").
- Every released version keeps frozen fixtures under `tests/fixtures/format/v<n>/`. Tests migrate all of them to the current version and validate the result.

Version 1 is the first format, so no migrations are registered yet.

## 8. Operations

Every edit is expressed as ops (see [`src/core/ops/ops.ts`](../src/core/ops/ops.ts)):

| Op | Payload | Inverse |
|---|---|---|
| `create` | full node | `delete` with the same node |
| `delete` | full node snapshot (leaf only; subtrees are deleted children-first) | `create` |
| `set` | `id`, `field`, `value`, `prev` (`undefined` = field absent) | `set` with `value` and `prev` swapped |

Ops are plain JSON, which is what makes journaling, undo/redo and replay possible.

**Transactions** group ops. Repeated `set`s of the same `(id, field)` coalesce, keeping the first `prev`. A 200-frame drag therefore records one op per changed field.

## 9. Local persistence records (IndexedDB `openframe`, schema v2)

| Store | Key | Value |
|---|---|---|
| `files` | `id` | `{ id, name, createdAt, updatedAt, lastPageId? }` |
| `snapshots` | `fileId` | `{ fileId, text: canonical JSON, savedAt }` |
| `journal` | auto-increment `seq` (index `fileId`) | `{ fileId, ops: Op[], ts }`, one batch per autosave flush |
| `settings` | string | arbitrary small values (e.g. `lastFileId`) |
| `images` (v2) | `hash` | `{ hash, bytes: ArrayBuffer, mime, width, height }` — encoded image bytes, shared by every local file |

**Schema upgrades** run inside `openDB`'s upgrade callback and only create what is missing. Version 1 created `files`, `snapshots`, `journal` and `settings`; version 2 adds `images`. Existing files are untouched.

**Images**
- On import, an image is decoded to learn its size. Images larger than 4096 px on either side are scaled down proportionally, and formats other than PNG, JPEG, WebP and GIF are re-encoded as PNG.
- The stored bytes are hashed with SHA-256 and written once per hash. Writing the same image again is a no-op.
- Deleting a file does not delete images, since other files may reference them. Garbage collection of unreferenced images is pending.

**Durability**
- Committed ops are batched and appended to the journal within 250 ms, and immediately on `pagehide` or when the tab becomes hidden.
- Opening a file loads its snapshot, then replays journal batches in `seq` order. This is crash recovery.
- Compaction writes a new snapshot and deletes the file's journal **in one IndexedDB transaction**. Ops are never lost or applied twice.
- Replay stops at the first batch that fails to apply. Earlier batches are kept, and the failure is logged.

## 10. File package (`.openframe`)

*Planned for milestone M9.*

A ZIP container:
- `meta.json`
- `document.json`: the canonical JSON described above
- `blobs/<sha256>`: images, video, embedded fonts
- `thumbnail.png`
- `sidecar/`: optional comments and version history

Until M9, documents live only in IndexedDB.
