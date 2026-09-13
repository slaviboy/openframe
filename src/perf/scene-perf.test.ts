/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Performance smoke test at 10,000 nodes (M1 exit criterion).
 *
 * Budgets are deliberately loose so the suite stays reliable on slower machines. Measured
 * timings are printed and recorded in docs/PERFORMANCE.md; regressions are tracked there.
 */
import { createRequire } from 'node:module';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '@/core/document/factory';
import type { DocumentStore } from '@/core/document/store';
import { keysBetween } from '@/core/ids/fractional-index';
import { IdGenerator } from '@/core/ids/ids';
import { hitTestDeepest, marqueeSelect } from '@/core/scene/hit-test';
import { SceneIndex } from '@/core/scene/scene-index';
import { SceneRenderer } from '@/engine/render/scene-renderer';

const require = createRequire(import.meta.url);
const FRAMES = 100;
const RECTS_PER_FRAME = 99; // 100 frames + 9,900 rectangles = 10,000 nodes
let ck: CanvasKit;

/** 10×10 grid of 1,000×1,000 frames, each holding a grid of rectangles. */
function buildLargeDocument(): { store: DocumentStore; pageId: string } {
  const ids = new IdGenerator('perf');
  const store = createEmptyDocument({ name: 'Perf', now: '2026-01-01T00:00:00.000Z', appVersion: 'perf', ids });
  const pageId = store.pages()[0]!;
  for (let f = 0; f < FRAMES; f++) {
    const frameId = ids.next();
    const fx = (f % 10) * 1100;
    const fy = Math.floor(f / 10) * 1100;
    store.applyOp({
      kind: 'create',
      node: makeFrame({ id: frameId, parent: { id: pageId, key: keyOnTop(store, pageId) }, name: `Frame ${f}`, x: fx, y: fy, width: 1000, height: 1000 }),
    });
    const keys = keysBetween(null, null, RECTS_PER_FRAME);
    for (let r = 0; r < RECTS_PER_FRAME; r++) {
      store.applyOp({
        kind: 'create',
        node: makeRectangle({
          id: ids.next(),
          parent: { id: frameId, key: keys[r]! },
          name: `Rect ${r}`,
          x: (r % 10) * 100 + 10,
          y: Math.floor(r / 10) * 100 + 10,
          width: 80,
          height: 80,
        }),
      });
    }
  }
  return { store, pageId };
}

const time = (fn: () => void): number => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

beforeAll(async () => {
  const init = require('canvaskit-wasm/bin/full/canvaskit.js') as (o: { locateFile: (f: string) => string }) => Promise<CanvasKit>;
  ck = await init({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });
});

describe('10,000-node scene', () => {
  test('index build, hit testing, marquee and culled rendering stay within budget', () => {
    let doc!: ReturnType<typeof buildLargeDocument>;
    const buildMs = time(() => (doc = buildLargeDocument()));
    const { store, pageId } = doc;
    expect(store.size).toBe(1 + 1 + FRAMES + FRAMES * RECTS_PER_FRAME);

    const index = new SceneIndex(store);
    const indexMs = time(() => index.ensure(pageId));

    // Drag preview: one frame (with 99 children) moves each pointer frame.
    const dragged = store.children(pageId)[0]!;
    const PREVIEWS = 60;
    const previewMs =
      time(() => {
        for (let i = 1; i <= PREVIEWS; i++) {
          const node = store.getOrThrow(dragged) as { transform: number[] };
          store.applyOp({ kind: 'set', id: dragged, field: 'transform', value: [1, 0, 0, 1, i, i], prev: node.transform });
          index.applyChange({ nodes: new Map([[dragged, new Set(['transform'])]]), structural: new Set() });
          index.ensure(pageId);
        }
      }) / PREVIEWS;
    expect(index.worldBounds(store.children(dragged)[0]!)!.x).toBe(PREVIEWS + 10);

    const HITS = 1000;
    const hitMs =
      time(() => {
        for (let i = 0; i < HITS; i++) {
          hitTestDeepest(store, index, pageId, { x: (i * 37) % 10900, y: (i * 53) % 10900 }, { tolerance: 0 });
        }
      }) / HITS;

    let marqueeCount = 0;
    const marqueeMs = time(() => {
      marqueeCount = marqueeSelect(store, index, pageId, { x: 0, y: 0, width: 5000, height: 5000 }, pageId, true).length;
    });

    // Viewport showing roughly one frame at 100%: culling must skip almost everything.
    const surface = ck.MakeSurface(1440, 900)!;
    const renderer = new SceneRenderer(ck);
    let stats = { drawn: 0, culled: 0, ms: 0 };
    const renderMs = time(() => {
      stats = renderer.render(surface.getCanvas(), store, index, pageId, { x: 0, y: 0, zoom: 1, width: 1440, height: 900, dpr: 1 });
      surface.flush();
    });
    // Zoomed out to fit everything: worst case, every node drawn.
    let fullStats = { drawn: 0, culled: 0, ms: 0 };
    const fullRenderMs = time(() => {
      fullStats = renderer.render(surface.getCanvas(), store, index, pageId, { x: 0, y: 0, zoom: 0.08, width: 1440, height: 900, dpr: 1 });
      surface.flush();
    });
    renderer.dispose();
    surface.delete();

    console.info(
      [
        `perf(10k): build ${buildMs.toFixed(1)}ms`,
        `index ${indexMs.toFixed(1)}ms`,
        `drag preview update ${previewMs.toFixed(3)}ms`,
        `hit ${hitMs.toFixed(3)}ms avg`,
        `marquee ${marqueeMs.toFixed(1)}ms (${marqueeCount} hits)`,
        `render viewport ${renderMs.toFixed(1)}ms (drawn ${stats.drawn}, culled ${stats.culled})`,
        `render all ${fullRenderMs.toFixed(1)}ms (drawn ${fullStats.drawn})`,
      ].join(' | '),
    );

    expect(indexMs).toBeLessThan(400);
    // Incremental update touches ~100 entries instead of 10,000.
    expect(previewMs).toBeLessThan(Math.max(2, indexMs / 5));
    expect(hitMs).toBeLessThan(2);
    expect(marqueeMs).toBeLessThan(200);
    expect(stats.drawn).toBeLessThan(500);
    expect(stats.culled).toBeGreaterThan(90);
    expect(fullStats.drawn).toBe(FRAMES + FRAMES * RECTS_PER_FRAME);
    expect(renderMs).toBeLessThan(250);
  });
});
