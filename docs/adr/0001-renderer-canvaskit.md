# ADR 0001 — Scene renderer: CanvasKit (Skia WASM) on WebGL2, Canvas 2D for editor chrome

- Status: Accepted (2026-09-13)
- Spike code: `spikes/canvaskit-capabilities.mjs` (Node), `spikes/browser/` (Playwright, 3 engines)

## Context

The editor must render, offline and consistently across Chromium/Firefox/WebKit:
19 layer blend modes plus pass-through, uniform and progressive layer/background blur, noise, texture
and glass effects, four gradient kinds (incl. diamond), image adjustments, masks (alpha/vector/luminance),
curve-preserving boolean operations, outline stroke/offset/simplify/trim, and text with OpenType features,
variable-font axes, bidi, and per-glyph placement for text on a path. It must stay responsive with 10k nodes
and support deterministic visual regression tests.

## Options evaluated

| Option | Verdict |
|---|---|
| Canvas 2D | No custom blend modes (linear burn, plus darker), no backdrop filters, no shaders for noise/glass/diamond gradients, no path booleans/offset, `ctx.font` cannot set arbitrary OpenType features, output differs per browser (goldens unreliable). Would require a separate WebGL effects pipeline plus a text shaper plus a boolean library — three subsystems CanvasKit already contains. |
| Raw WebGL2 (own renderer) | Maximum control but months of work to reach Skia's path rasterization/AA quality and text; no reason to rebuild it. |
| WebGPU | Not available in all target engines without flags; no mature 2D vector/text stack. Revisit later behind the `RenderBackend` interface. |
| **CanvasKit 0.42 (full build)** | Covers every requirement (spike below). Cost: ~8.2 MB wasm (precached by the service worker), manual `delete()` of WASM objects. |

## Spike results

Node (CPU surface), `canvaskit-wasm@0.42.0` full build — init 23 ms:

| Capability | Result |
|---|---|
| PNG encode is byte-identical across runs | PASS (enables golden tests in Vitest) |
| JPEG / WebP encode | PASS — **only in the `full` build** (default build returns null) |
| Native blend modes | 16 separable/non-separable + Plus |
| Custom blender via `RuntimeEffect.MakeForBlender` | PASS → linear burn, plus darker implemented in SkSL |
| `saveLayer` with backdrop blur filter | PASS → background blur, glass base |
| `RuntimeEffect` shader (SkSL) | PASS → noise, texture, diamond gradient, progressive blur mask |
| `Path.MakeFromOp` union of cubic ovals | PASS, curves preserved (160 curve commands) |
| `makeStroked` / `makeDashed` / `makeTrimmed` | PASS |
| Simplify | `makeSimplified()` is declared in typings but **missing from the JS binding**; use `MakeFromOp(path, emptyPath, Union)` |
| Typeface from Inter variable **WOFF2** | PASS — no TTF conversion step needed |
| Paragraph with `fontFeatures` + `fontVariations`, `getRectsForRange`, `getGlyphPositionAtCoordinate`, bidi text | PASS |
| `TextBlob.MakeFromRSXform` (text on path) | PASS |
| `PictureRecorder` display lists | PASS |

API note: in 0.42 `Path` is immutable; construct with `PathBuilder` then `detachAndDelete()`.

Browsers (Vite dev server, WebGL surface, network requests asserted empty):

| Engine | Init | GPU surface | Pixel check |
|---|---|---|---|
| Chromium | 68 ms | yes | PASS |
| Firefox | 82 ms | yes | PASS |
| WebKit | 94 ms | yes | PASS |

## Decision

- Scene rendering, text layout/shaping, path geometry (booleans, stroke outlining, dash, trim, simplify)
  and raster encoding use CanvasKit **full** build, vendored from `node_modules` and bundled by Vite.
- Editor chrome (selection, handles, guides, redlines, rulers, vector points, motion path, caret) is drawn on
  a separate Canvas 2D overlay canvas so pointer-frame redraws never touch the scene.
- The renderer is consumed through `RenderBackend` / `TextMeasurer` interfaces so a WebGPU or Canvas 2D
  backend can be introduced without touching document, layout, or editor code.
- All CanvasKit objects are owned through a disposal helper; dev builds warn about leaked objects.

## Consequences

- Visual goldens run in Node against the same WASM → deterministic engine tests.
- Service worker must precache the wasm; first install downloads ~8 MB once.
- Glass is an approximation built from backdrop blur + refraction shader; documented in FEATURE_MATRIX.
