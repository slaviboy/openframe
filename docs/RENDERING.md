# Rendering

The decision record is [ADR 0001](adr/0001-renderer-canvaskit.md). In short:
- CanvasKit (the Skia WebAssembly build, "full" variant) draws the design on a WebGL2 canvas.
- A Canvas 2D overlay draws the editor chrome on top.

## Canvas host

[`src/ui/canvas/CanvasHost.tsx`](../src/ui/canvas/CanvasHost.tsx) stacks two canvases:

| Layer | API | Content |
|---|---|---|
| Scene | CanvasKit `MakeWebGLCanvasSurface`, falling back to `MakeSWCanvasSurface` | Page background and all layers |
| Overlay | Canvas 2D | Frame titles, hover outline, selection outlines and handles, size label, marquee |

**Frame scheduling**
- The editor emits render requests on document changes (commits, undo/redo, gesture previews), editor-state changes and viewport changes.
- The host coalesces them into one `requestAnimationFrame`.

**Sizing**
- A `ResizeObserver` resizes both canvases to CSS size × `devicePixelRatio`.
- On each resize the host recreates the CanvasKit surface and updates `editor.canvasSize`.

**Failure handling**
- **WebGL context loss:** the surface is dropped on `webglcontextlost` and recreated on `webglcontextrestored`.
- **Engine load failure:** an informational message is shown. It sets `pointer-events: none` so it never blocks the canvas.
- **Scene render errors:** caught and logged per frame. The overlay still draws.

**Loading**
- CanvasKit is imported from `canvaskit-wasm/bin/full`.
- The wasm file is emitted as a hashed same-origin asset and precached by the service worker.
- The CSP must allow `'wasm-unsafe-eval'` for WebAssembly compilation.

## Scene renderer

[`src/engine/render/scene-renderer.ts`](../src/engine/render/scene-renderer.ts) is stateless with respect to the document. Each frame it:
1. Clears to the page's background color.
2. Applies `scale(dpr)`, `scale(zoom)` and `translate(-viewport origin)`.
3. Makes sure the page's `SceneIndex` is up to date.
4. Draws the page's children in order, back to front.

**Per node**
1. **Skip** invisible nodes and nodes with opacity 0.
2. **Cull.** A node is skipped when its paint bounds, including stroke outset, miss the visible world rect and either:
   - it has no children, or
   - it is a frame with **clip content** enabled.

   Non-clipping containers are always visited, because their children may overflow them.
3. **Transform:** `concat` the node's parent-relative transform.
4. **Isolation layer:** `saveLayer` with alpha and blend mode, when opacity < 1 or the blend mode is anything other than pass-through or normal.
5. **Fills:** each visible paint in array order, so the last paint ends up on top.
6. **Strokes** (see below). Shapes draw them right after their fills. Frames draw them after their children, so frame borders sit above content.
7. **Children**, clipped to the frame's rounded rectangle when clip content is on.

**Stroke style**
- Joins map to Skia stroke joins. A miter angle θ becomes a miter limit of `1 / sin(θ / 2)` (the default 28.96° ≈ 4).
- Dashes use `PathEffect.MakeDash(strokeDashes, dash / 2)`, so every dashed path starts with a half dash; the dash cap is the stroke cap. On lines, dashes apply to the body and end markers stay solid.
- Per-side strokes (`individualStrokeWeights`) are drawn as `drawDRRect(outer, inner)`: the outer edge sits at `−k · weight` and the inner edge at `(1 − k) · weight` from each side, with k = 0 (inside), ½ (center) or 1 (outside). Paint bounds use the largest side.

**Stroke alignment**

| Alignment | Technique |
|---|---|
| Center | Stroke of width `w` |
| Inside | Stroke of width `2w`, clipped to the shape |
| Outside | Stroke of width `2w`, clipped to the region outside the shape (`ClipOp.Difference`) |

**Shape outlines**
- Frames and rectangles draw as rounded rectangles (`RRect`). Sections use a fixed 2px corner radius, draw their border before their children, and never clip.
- Slices are skipped entirely; the overlay shows them as dashed outlines when hovered or selected.
- Ellipses, polygons and stars draw as paths built once per node per frame. The same path is the clip for inside and outside strokes. Polygon and star vertices come from [`core/geometry/shapes.ts`](../src/core/geometry/shapes.ts), which the hit tester also uses.

**Paints**
- **Color profile.** `RenderOptions.colorProfile` is the file's profile.
  - **Colors:** every document color passes through `color()`. In Display P3 files, `documentToSrgb` converts it to extended sRGB, which can hold values outside 0–1. Solids, gradient stops, shadow colors and the page background all go this way.
  - **Surface:** CanvasHost creates the canvas surface with `ColorSpace.DISPLAY_P3` for P3 files, so Skia keeps the wider gamut when it maps colors onto the surface. It recreates the surface when the profile changes.
  - **Exceptions:** noise uniforms and image pixels are not converted. The noise shader runs in the surface's color space, and encoded images carry their own color space.
- Solid paints set the paint color with the paint opacity folded into alpha.
- Gradient paints set a shader and a white color whose alpha is the paint opacity. Shaders are built per draw in unit gradient space and mapped onto the layer with `scale(width, height) · gradientTransform` (lines use the stroke weight as height):
  - linear: `MakeLinearGradient` from (0, ½) to (1, ½)
  - radial: `MakeRadialGradient` centered at (½, ½), radius ½
  - angular: `MakeSweepGradient` around (½, ½), starting at 3 o'clock and running clockwise
  - diamond: an SkSL runtime shader that samples a linear color ramp at `(|x − ½| + |y − ½|) · 2`
- Stops are sorted by position; colors are interpolated in unpremultiplied space.
- **Pattern paints.** Before a layer draws, `preparePatterns` records each of its visible pattern fills and strokes. Doing this first matters: recording reuses the renderer's shared paints, which must not change mid-draw.
  - **Recording:** each placement of `patternLayout` becomes a `PictureRecorder` picture one tile in size. The source is drawn with `drawNode` under the inverse of its own transform, scaled, unculled and without crop previews.
  - **Shader:** `SkPicture.makeShader` with Repeat tiling, offset to the alignment origin. `configurePaint` uses it with the paint opacity. Shaders are deleted after the layer draws.
  - **Recursion guard:** a source already being recorded (the layer itself, or a cycle) records nothing.
- Image paints set an image shader and a white color whose alpha is the paint opacity.
  - The renderer takes an `ImageSource` (the editor's image registry) that maps hashes to encoded bytes. Bytes are decoded once with `MakeImageFromEncoded` and cached per hash until `dispose()`.
  - The shader's local matrix is `imagePlacement(...)`, which maps image pixels to layer coordinates. `TILE` uses `TileMode.Repeat`; the other modes use `Decal`, so areas outside the image stay transparent. Sampling uses linear filtering.
  - A hash that is not in memory yet is requested from the source and drawn as a 16 px checkerboard (white and #CCCCCC in 8 px squares). The registry requests a redraw when the bytes arrive.
  - Adjustments (`filters`) wrap the image shader in an SkSL runtime shader ([`image-adjust.ts`](../src/engine/render/image-adjust.ts)). Its seven uniforms follow `IMAGE_ADJUSTMENTS` order.
    - The shader unpremultiplies each sample and works on sRGB-encoded values, in this order: exposure `× 2^e`, contrast around 0.5, saturation around Rec. 709 luma, temperature/tint channel offsets, then highlights/shadows lifts weighted by `smoothstep` on luma. It clamps and re-premultiplies the result.
    - `adjustColor` in [`core/image/adjustments.ts`](../src/core/image/adjustments.ts) is the reference implementation. `image-render.test.ts` checks rendered pixels against it within 2 levels.
  - Masks ([`core/scene/masks.ts`](../src/core/scene/masks.ts)): `drawChildren` splits children into runs with `maskRuns`. A visible mask and the siblings above it, up to the next mask, draw into a `saveLayer`. The mask then draws into a nested layer composited with `DstIn`, so content survives only where the mask has coverage.
    - Alpha masks use the mask's pixels as they are.
    - Vector masks apply a color matrix that scales alpha by 255, so any coverage becomes opaque.
    - Luminance masks replace alpha with Rec. 709 luma of the unpremultiplied color.
    - Outline mode ignores masks.
  - Crop mode (`RenderOptions.cropping`): before the layer's geometry, the whole image of its top `CROP` fill is drawn at 35% of the paint opacity, filling the image's quad. The overlay adds the dashed image outline and corner handles.

**Effects** (uniform; `blurSigma(radius) = radius / 2`)
- A layer with visible shadows or a layer blur is drawn into a `saveLayer` whose paint carries one composed image filter; the layer's opacity and blend mode apply to the result.
  - Drop shadow: `MakeDropShadowOnly` of the content (through `MakeDilate`/`MakeErode` for spread), merged with `MakeBlend(SrcOver)`. Unless **Show behind transparent areas** is on, the shadows are cut by the content's opaque silhouette (`MakeBlend(DstOut)` with an alpha-saturating color matrix). The shadow's opacity follows the content's alpha.
  - Inner shadow: a color matrix turns the content into `(1 − α) · shadow color`, then offset, spread, blur, and `MakeBlend(SrcIn)` masks it back to the content, drawn over the content.
  - Layer blur: `MakeBlur(σ, σ, Decal)` around everything above.
- Background blur: before the layer is drawn, the canvas is clipped to the layer's area (`backdropOutline`) and `saveLayer(null, null, MakeBlur(σ))` copies the blurred backdrop in.
  - The area is the shape's outline, a line's stroke (`makeStroked`, without end markers), or for a group the union (`Path.MakeFromOp`, Union) of its visible children's areas, each placed by its transform.
- Paint bounds grow by `effectOutset`: the largest drop-shadow offset plus blur plus positive spread, or the layer-blur radius.
- Shadow blend modes:
  - Inner shadows blend onto the content inside the filter chain (`ImageFilter.MakeBlend` with the shadow's native Skia mode; plus darker, which needs a runtime blender, falls back to source-over).
  - Drop shadows whose mode isn't normal are left out of the filter. Each is drawn first in its own pass (`drawBlendedDropShadows`): a `saveLayer` whose paint carries a shadow-only filter (knocked out under the layer unless shown behind it), the layer's opacity and the shadow's blend mode. Inside that layer the node's silhouette (geometry, children, frame strokes) is drawn without effects, so the shadow composites with what is already on the canvas.
- Progressive blurs (layer and background) use `progressiveBlurLevels`: 2–8 uniform blur levels from the start radius to the end radius. Each level's weight along start → end is a "hat" function, and the weights sum to 1 everywhere.
  - Each level is `MakeBlur` (or the unblurred input for radius 0), masked by `ImageFilter.MakeShader` of a linear gradient carrying the weight as alpha (`DstIn`).
  - The masked levels are summed with `Plus`.
  - The same filter serves as the layer filter (Decal edges) and as the backdrop filter of a background blur (Clamp edges).
- Layer blur, noise and texture are applied after the shadows, in their order in the effects list.
  - **Noise** is an SkSL shader in layer coordinates ([`noise-sksl.ts`](../src/engine/render/noise-sksl.ts)).
    - Each `noiseSize` cell is hashed. Cells above `density` are empty; the rest take the mono color, one of the duo colors, or a random color at the multi opacity.
    - The shader becomes an image filter, is kept only where the content has coverage (`SrcIn`), and blends over the content with the effect's native blend mode.
  - **Texture** displaces the content with `MakeDisplacementMap`, up to `radius` pixels (scale `radius × 2`). The displacement field is a smooth value-noise SkSL shader whose grain is `noiseSize`. `clipToShape` keeps the displaced result inside the original coverage (`SrcIn`); unclipped textures grow the paint bounds by `radius`.
- **Glass** replaces background blur when it comes first in the list (`backdropEffect`). `drawGlass` works inside the layer's shape clip:
  - **Backdrop filter:** frost is `MakeBlur(radius / 2)`. Refraction is `MakeDisplacementMap` with scale `refraction × depth`. Its field is [`GLASS_FIELD_SKSL`](../src/engine/render/glass-sksl.ts): a rounded-box or ellipse signed distance function whose outward normal, faded over `depth`, is encoded in red and green.
  - **Dispersion:** red, green and blue are displaced by (1 ± 0.3 × dispersion) × scale, isolated with color matrices, and recombined with `Lighten`.
  - **Light:** a stroke of the shape, whose inner half survives the clip, with a linear gradient from the light side (`lightIntensity`), through transparent, to the opposite side (35%). Splay widens the stroke and adds a mask blur.
  - The layer's content then draws on top.

**Outline mode**
- `render(…, { outlines: true, includeHidden })` draws each layer's geometry with a hairline paint (stroke width 0, one device pixel at any zoom), black or white depending on the page background's luminance.
- Fills, strokes, opacity, blend modes and clipping are skipped. Culling then only skips childless layers outside the view.
- Hidden layers are outlined only with `includeHidden`.

**Lines**
- A line is a center stroke from `(0, 0)` to `(width, 0)` with a butt cap, whatever its `strokeAlign`.
- Each end draws its own marker in the stroke paint. Marker size is `max(6, 4 × weight)`:
  - round and square: a circle or half-square of the stroke weight
  - line arrow: two stroked segments at ±30°
  - triangle arrow, circle and diamond: filled shapes
- The body stops at a triangle arrow's base, so the butt end cannot poke through the tip.
- Paint bounds add half the marker size when a marker is present.

**Text**
- `TextShaper` ([`engine/text/text-shaper.ts`](../src/engine/text/text-shaper.ts)) builds an SkParagraph per text layer from a `TypefaceFontProvider`. It uses HarfBuzz shaping and ICU line breaking. `applyRoundingHack` is off, so auto-width text laid out at its exact natural width doesn't wrap.
- **Fonts:** the bundled Inter variable font (weight axis 100–900, upright and italic) loads with CanvasKit before the canvas reports ready ([`bundled-fonts.ts`](../src/engine/text/bundled-fonts.ts)). The font files are embedded as base64 in a lazily imported chunk (`bundled-font-data.ts`) and decoded in memory, because app code never uses `fetch`, not even for same-origin assets.
  - The Latin subset is registered as `Inter`. Latin-extended, Cyrillic, Greek and Vietnamese subsets, plus Noto Sans Arabic and Noto Sans Hebrew (variable weight), are registered under internal family names (`Inter (…)`) and listed after the layer's family as fallbacks.
- **Direction:** each paragraph's SkParagraph gets `textDirection` from `resolveDirection` ([`core/text/direction.ts`](../src/core/text/direction.ts)): the paragraph's stored `textDirection`, or its first letter's script when `AUTO`. ICU bidi then orders the runs.
  - Carets use the direction reported by `getRectsForRange`: the right edge of a right-to-left glyph is its leading edge.
  - Right-to-left list items keep their text at the left edge. Their marker is drawn after the text area, on the right.
  - Style names map to a `FontWeight` plus a `wght` font variation, and italic to `FontSlant.Italic` ([`core/text/font-style.ts`](../src/core/text/font-style.ts)).
  - **User fonts** (uploaded or installed; `editor.fonts`, persisted in the IndexedDB `fonts` store) are registered with `TextShaper.registerFonts` when the canvas starts and whenever more are added, which drops cached layouts. They are also added to `document.fonts` as `FontFace`s from their bytes, for UI previews. `fontFamilyOf` reads a font file's family name through `Typeface.getFamilyName` for formats the name-table parser can't read.
- **Text style:**
  - Line height: auto is the font's own; pixels and percent become a height multiplier with half leading.
  - Letter spacing in percent is relative to the font size.
- **Paragraphs:** each paragraph (text between line breaks) is its own SkParagraph ([`core/text/paragraphs.ts`](../src/core/text/paragraphs.ts)), laid out at a common width and stacked with `paragraphSpacing` between them.
  - A first-line indent is a zero-height placeholder before the paragraph's first character, for left-aligned and justified text. Paragraph-local offsets are shifted by that one placeholder.
  - An empty paragraph shapes a zero-width space in the style of the character before it.
  - `maxLines` is shared in order (`lineBudgets`), and truncation hides every paragraph after the first one it cuts. The first paragraph always keeps at least one line.
  - **Lists** ([`core/text/lists.ts`](../src/core/text/lists.ts)): a paragraph's `listType` and `indentation` come from its first character (`paragraphStyleOffset`). A list item is laid out narrower and drawn shifted right by level × 1.5 em (the `left` of its layout), so wrapped lines hang under the first; carets, hit testing and selection rectangles add the same offset. It takes no first-line indent.
    - The marker ("•", or "1." / "a." / "i." by level from `listCounters`) is a separate one-line SkParagraph in the item's style without decoration or letter case. It is drawn 0.4 em before the text, on the first line's baseline.
    - `listSpacing` replaces `paragraphSpacing` between two consecutive list items.
- **Layout by `textAutoResize`:**
  - Auto width is laid out at its natural width (never narrower than the box).
  - Everything else wraps to the box width.
  - Fixed and truncated boxes are offset vertically by `textAlignVertical`.
  - Truncated boxes are rebuilt with `maxLines` set to the lines that fit and an ellipsis.
- **Decoration, case and max lines:**
  - Underline and strikethrough become SkParagraph decorations. Their thickness is the font size ÷ 16 (at least 1). Their color is the segment's top visible fill: the paint's color, a gradient's first stop, or black for images and patterns. Decorations don't take the glyph paint.
  - Letter case is applied to each segment's characters when building the paragraph (`applyTextCase`). Characters whose case would change their length stay as typed, so offsets still match. Small caps enables the `smcp` feature.
  - **OpenType features:** a run's `openTypeFeatures` become SkParagraph `fontFeatures` (1 on, 0 off), together with `smcp` for small caps ([`core/text/opentype.ts`](../src/core/text/opentype.ts)).
    - `TextShaper.supportedFeatures(fontName)` shapes `FEATURE_PROBE_TEXT` (printable ASCII plus fractions, ligature pairs, ordinals and capitals with punctuation) in that family alone. It then shapes the text again with each probed tag switched from its default. A tag is supported when any glyph ID or position changes.
    - Results are cached per family and style, and cleared when fonts are registered. Font files are never parsed for their GSUB/GPOS feature lists, so compressed WOFF2 fonts work the same way.
  - **Variable axes:** each run's font variations are `wght` from the style name, unless `fontVariations.wght` overrides it, plus every other stored axis (`variationSettings` in [`core/text/font-variations.ts`](../src/core/text/font-variations.ts)).
    - `TextShaper.fontAxes(family)` reports the bundled Inter's weight axis (100–900). For user families it reports the axes that `readFontAxes` read from each registered file's `fvar` table ([`core/text/font-names.ts`](../src/core/text/font-names.ts)).
    - Axes from several files of one family are merged into one range per axis (`mergeAxes`).
  - `maxLines` sets the paragraph's max lines and an ellipsis.
- **Drawing:** each visible fill is drawn as a paragraph built with `pushPaintStyle`, so gradients, images and patterns shade the glyphs. Outline mode paints the glyphs with the hairline paint. A background blur on text uses the text box.
- **Editing and measuring:** the same shaper implements the editor's `TextLayoutService` (measure, caret, hit, selection rectangles, line navigation). Paragraphs are cached per layer by node identity (up to 256), so what is measured is what is drawn.

**Corner radii**
- Radii are clamped to half the shorter side.
- `cornerRadii`, when present, overrides the uniform radius.
- Polygons and stars with a `cornerRadius` build their path from the midpoint of the closing edge, with `arcToTangent` at each vertex. Each vertex's radius is clamped (`clampCornerRadius`) so its tangent points stay within half of each adjacent edge. Hit testing still uses the sharp outline.
- **Corner smoothing** (`cornerSmoothing` > 0) replaces the RRect or tangent-arc path with `roundedPolygon` ([`core/geometry/corners.ts`](../src/core/geometry/corners.ts)), converted to a CanvasKit path. Each corner keeps the circle of a plain round corner, but the arc covers only (1 − smoothing) of the sweep. Two cubic Béziers ease into it from the edges, starting (1 + smoothing) × the tangent distance from the vertex. For 90° corners this matches the reference's squircle construction. When an edge is too short, smoothing is reduced first, then the radius. Frames with smoothing clip their children to the same path. Smoothed rectangles hit-test against the flattened outline (`flattenPath`).

**Blend modes** ([`blend.ts`](../src/engine/render/blend.ts))
- Seventeen document modes map to native Skia blend modes; `PASS_THROUGH` and `NORMAL` both map to `SrcOver`.
- `PLUS_DARKER` has no Skia equivalent. It is implemented as an SkSL runtime blender: `rgb = max(0, src + dst − srcα·dstα)`, `α = srcα + dstα·(1 − srcα)`.

**Stats**
- `render()` returns `{ drawn, culled, ms }`.
- Tests use these values to assert culling behavior.

## Scene index and hit testing

[`src/core/scene/scene-index.ts`](../src/core/scene/scene-index.ts) has no DOM or engine dependency. It derives, for the active page:
- world transforms (the product of parent transforms)
- world-space axis-aligned bounds of each node's geometry
- paint bounds, which add the stroke outset
- a packed Hilbert R-tree over the paint bounds, used for culling, marquee selection and hit candidates

It rebuilds lazily when the document revision or the page changes.

[`src/core/scene/hit-test.ts`](../src/core/scene/hit-test.ts) turns a point into a node:
1. Queries the spatial index with a tolerance box.
2. Walks the tree in reverse paint order, top to bottom.
3. For each candidate, tests the point exactly in the node's local space:
   - rectangles and frames: rounded-rectangle geometry
   - ellipses: the ellipse equation
   - polygons and stars: point-in-polygon, or distance to an edge within the tolerance
   - lines: distance to the segment ≤ half the stroke weight + tolerance
   - sections: their rectangle
   - slices: their rectangle, but only when no painted layer is under the point
   - groups: never hit directly
4. Rejects points clipped out by a clipping ancestor frame.
5. Skips hidden or locked nodes, including those inside hidden or locked ancestors.

Selection targeting rules (artboards, groups, sibling context, deep select) are documented in [EDITOR.md](EDITOR.md).

## Determinism and tests

CanvasKit's CPU surface produces byte-identical pixels across runs. [`scene-renderer.test.ts`](../src/engine/render/scene-renderer.test.ts) renders a fixed scene in Node and checks:
- canvas background
- frame fill
- child clipping
- inside stroke
- 50% multiply blending (exact expected color)
- culling counts
- zoom scaling

## Planned

| Capability | Approach | Milestone |
|---|---|---|
| Per-node display lists | `SkPicture` recorded in local space, keyed by node revision and resolved inputs | M2 |
| Tile cache | 512 px device tiles at quantized zoom levels; invalidate old ∪ new bounds from `ChangeSet`; progressive refinement | M2 |
| Lift layer | Dragged selection drawn live above cached tiles | M2 |
| Gradients (linear, radial, angular, diamond), image and pattern fills, image adjustments | Skia shaders; SkSL for diamond gradients and adjustments | M3 |
| Drop and inner shadows, layer and background blur (uniform and progressive), noise, texture, glass | Image filters, backdrop `saveLayer`, SkSL | M3 |
| Masks (alpha, vector, luminance) | Isolation layers with `DstIn`, path clips, luma color filter | M3 |
| Outline mode, pixel preview, pixel grid | Hairline geometry pass; 1× render with nearest-neighbor scaling; grid drawn on the overlay | M2 |
| Text | SkParagraph (HarfBuzz shaping, ICU bidi and line breaking), OpenType features, variable axes | M4 |
| Exports | CanvasKit in a worker; PNG, JPEG and WebP encoders from the full build | M9 |
