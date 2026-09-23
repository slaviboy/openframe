# Performance

The editor must stay responsive with 1,000, 5,000 and 10,000 objects. Performance work follows measurement: every optimization starts from a number recorded here.

## Current measurements (M1)

**Setup**
- Test: [`src/perf/scene-perf.test.ts`](../src/perf/scene-perf.test.ts)
- Machine: Apple Silicon Mac, Node 25, CanvasKit 0.42 CPU surface (no GPU)
- Document: 10 × 10 grid of 1,000 × 1,000 frames holding 99 rectangles each, 10,000 scene nodes in total

| Operation | Time | Budget (test assertion) |
|---|---:|---:|
| Build document (10,000 `create` ops) | 11.4 ms | n/a |
| Build scene index: world transforms, bounds, Hilbert R-tree | 16.0 ms | < 400 ms |
| **Drag preview update**: one frame with 99 children moved, incremental index update | **0.053 ms** | < max(2 ms, full build / 5) |
| Hit test (deepest layer under a point) | 0.31 ms avg | < 2 ms |
| Deep marquee over a quarter of the canvas (2,100 hits) | 2.3 ms | < 200 ms |
| Render one 1440×900 viewport at 100% (128 drawn, 170 subtrees culled) | 3.4 ms | < 250 ms, and fewer than 500 nodes drawn |
| Render all 10,000 nodes (zoomed out, CPU raster) | 52.7 ms | all nodes drawn |

Budgets are loose on purpose, so the suite stays stable on slower machines. Regressions are caught by comparing against the numbers in this table.

In the browser, rendering uses CanvasKit's WebGL surface. The CPU numbers above are an upper bound for rasterization cost.

## What makes it fast today

- **Hierarchical culling.** A clipping frame outside the viewport skips its whole subtree. Leaves outside the viewport are skipped individually.
- **Static packed R-tree.** Flat typed arrays, Hilbert-sorted. Rebuilding 10,000 entries takes about 15 ms. Queries don't allocate per node.
- **Chrome is separate from the scene.** Selection outlines, handles, marquee and labels draw on a Canvas 2D overlay, so pointer hover never re-renders the scene.
- **At most one frame per animation tick.** The canvas host coalesces all render requests into one `requestAnimationFrame`.
- **Transactions coalesce.** A drag records one op per changed field, not one per pointer event. History and the autosave journal stay small.
- **React never re-renders on document changes except through selectors.** The layers panel is virtualized (fixed 32 px rows, ±8 overscan rows).

## Known bottlenecks (planned work)

| Issue | Impact at 10k nodes | Plan | Milestone |
|---|---|---|---|
| ~~The scene index rebuilds on every document revision, including each preview frame of a drag~~ | ~~About 15 ms per pointer frame~~. **Resolved in M2:** geometry changes reported through `ChangeSet` recompute only the edited subtrees (0.053 ms per preview), and the spatial tree rebuilds lazily on the next query | — | M2 (done) |
| ~~Full scene redraw each frame~~ | ~~51 ms CPU when everything is visible~~ | **Measured in the browser and left alone.** Caching the drawn page was built twice — as an `SkPicture` replayed on pan, and as a pixel picture of an area half a viewport wider on each side, blitted while the pan stayed inside it — and neither changed the frame times below (median 14.8 ms either way, with 50 blits to 20 full draws). On a WebGL surface the cost is rasterizing the pixels, which a cache of the drawn page pays anyway. Both were taken out rather than carried as machinery that buys nothing | — (M2, measured) |
| Layer rows are recomputed from the tree on every revision | Linear in expanded rows | Invalidate from `ChangeSet.structural` and name/visibility fields only | M2 |
| ~~Browser frame timing not yet measured~~ | — | **Resolved in M2:** [`e2e/large-document.spec.ts`](../e2e/large-document.spec.ts) builds 8,192 layers through the editor itself, fits them all on screen and pans, reading the gaps between animation frames | — (done) |

## Current measurements in the browser (M2)

**Setup**
- Test: [`e2e/large-document.spec.ts`](../e2e/large-document.spec.ts), Chromium only (the frame-time reading is the same everywhere; running it three times over would only lengthen the suite)
- Machine: Apple Silicon Mac, headless Chromium, CanvasKit WebGL surface, 1440 × 900 viewport
- Document: one rectangle duplicated thirteen times over — 8,192 layers, all of them on the page and all in view

| Operation | Time | Budget (test assertion) |
|---|---:|---:|
| Build 8,192 layers (thirteen Select all + Duplicate rounds) | 0.94 s | < 60 s |
| Frame gap while panning with everything in view, median | 14.8 ms | < 34 ms |
| Frame gap while panning with everything in view, p95 | 81 ms | < 120 ms |

A median of 14.8 ms is the display's own 60 Hz cadence, so the canvas keeps up with the screen while a document of
this size is panned in full. The p95 is where a frame is missed — a garbage collection or a long task elsewhere in
the page, not the scene walk, which is why caching the drawn page made no difference to it.

## Zooming a real board (2026-09-23)

**Setup**
- Test: [`e2e/large-document.spec.ts`](../e2e/large-document.spec.ts), Chromium, WebGL surface, 1440 × 900
- Document: `reference/app/sample-large.openframe` — 725 layers, of which **421 are text** (23,133 characters,
  nine font sizes from 10 to 34 px) and 39 are image fills of 1080 × 2400 sources. Gitignored, so the
  test skips when it isn't there.
- The sweep zooms from fit in through 100 % and back out, twice, reading the gaps between animation frames.

| | Before | After |
|---|---:|---:|
| Frame gap, median | 16.7 ms | 16.6 ms |
| Frame gap, p95 | 18.8 ms | 18.2 ms |
| **Worst frame, first sweep** | **2,102 ms** | **833 ms** |
| **Worst frame, second sweep** | **2,102 ms** | **19.2 ms** |

Zooming was never slow *on average* — the median was already the display's own cadence. It stopped dead
for two seconds at one point in the sweep, every time, and that is the whole complaint.

**Where the two seconds went.** Text below `GREEK_MIN_EM_PX` is drawn as bars and never shaped, and
`drawGreekedText` returned before ever asking for the shaped text — so the sweep at the start of the
next frame dropped every block on the board. Zooming back in past the threshold then had to shape all
421 layers in one frame. Nine font sizes means nine thresholds, spread across roughly 9 % to 30 % zoom.

Two things fixed it:

- **A layer drawn as bars says it is still on screen** (`TextShaper.keep`). It builds nothing; it only
  keeps what was already shaped from being swept. That is what takes the second sweep to 19.2 ms: once
  the board has been shaped, zooming in and out is at frame rate for good.
- **An axis already at its default is not set at all.** `variationSettings` always emitted
  `wght` — including 400 on a font whose weight axis defaults to 400 — and setting `fontVariations` makes
  Skia instance the variable font again **on every layout**:

  | One paragraph, 54 characters, first layout | |
  |---|---:|
  | No `fontVariations` | **0.160 ms** |
  | `fontVariations: wght 400` (the font's own default) | **1.155 ms** |
  | `fontVariations: wght 600` | 1.135 ms |

  Shaping the board's 421 layers went from **1,615 ms to 605 ms**; the layers with no style runs, which
  are all Regular, went from 3.07 ms each to **0.35 ms** — 8.7× — because they now ask for nothing.

**What is left.** The first crossing still costs 833 ms, and it is the 255 layers whose style runs are
Semi Bold: a weight that isn't the axis default genuinely has to be set, and CanvasKit has no way to
register a pre-instanced variable font (`TypefaceFontProvider.registerFont` takes bytes and a family
name, nothing else). It is now paid **once per document** rather than on every crossing.

**What this is not.** Rasterising is not the problem here and neither is the scene walk: on this board
the median frame is 16.6 ms with everything on screen. The 10,000-node numbers below are a different
regime — a page with that many nodes spends its frame in the walk, which is still worth attention, but
it is not what made zooming stop.

## Text: what a frame keeps, and what it doesn't draw at all

Shaping a text layer — HarfBuzz through SkParagraph, a paragraph at a time — is the most expensive thing a frame can
do per layer, so a frame does it as rarely as it can.

**Laid-out text is kept by the frame that drew it** ([`beginFrame`](../src/engine/text/text-shaper.ts)). The shaper
holds a laid-out block per drawn layer, and a sweep at the start of each frame drops the blocks the frame before it
didn't draw, down to 256. The count is a floor, not a cap: a frame that draws a thousand text layers keeps a thousand
blocks, because dropping any of them means shaping that layer again on the next frame, and the next.

This replaced a cache of 256 blocks that evicted by age. A page draws its layers in the same order every frame, so
the block it dropped was the one the next frame asked for first — a cyclic scan through a cache smaller than the scan
never hits. Two blocks were held per layer, so the cliff came at **128 text layers on screen at once**, which is what
zooming out far enough to see a whole board does:

| Text layers on screen (Chromium, `reference/app/sample-large.openframe`) | 126 | 128 | 130 | 212 |
|---|---:|---:|---:|---:|
| Frame time while panning, before | 16.4 ms | 16.5 ms | 988 ms | 1548 ms |
| Frame time while panning, after | 16.4 ms | 16.5 ms | 16.5 ms | 15.9 ms |

Two more layers cost sixty times the frame time, at any zoom — the number on screen was what mattered, not how far
out the canvas was. [`e2e/text-repaint.spec.ts`](../e2e/text-repaint.spec.ts) holds both ends of this: ten layers
kept between frames, and a board of 212 fitted on screen and panned.

**Text too small to read is never shaped** ([`greekedLines`](../src/engine/text/text-shaper.ts)). Below three device
pixels to the em a glyph cannot survive rasterizing, so the layer draws as a bar per line in its own fills instead —
the lines where the font's metrics put them, as wide as their characters make them. A board of 2,120 text layers at
2% draws in 65 ms a frame this way, and holds no laid-out text at all.

Bars would be a heavier page than glyphs if they were solid, so a bar is `GREEK_INK` (0.38) of its fill — the share
of its line box Latin text covers. `scene-renderer.test.ts` renders the same layers either side of the threshold and
holds the two within 10% of the same mean ink; they measure 0.5% apart.

Only a surface a person pans and zooms asks for this (`greekText`). An export writes what the layers say however
small it is asked to draw them, and so does a thumbnail.

## How to measure

```bash
npx vitest run src/perf --silent=false --reporter=verbose
```

When performance-relevant code changes, record new numbers in the table above together with the commit.
