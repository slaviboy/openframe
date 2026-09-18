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

## How to measure

```bash
npx vitest run src/perf --silent=false --reporter=verbose
```

When performance-relevant code changes, record new numbers in the table above together with the commit.
