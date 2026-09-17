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

import { createRequire } from 'node:module';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, test } from 'vitest';
import { BLACK, createEmptyDocument, keyOnTop, makeRectangle, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { SceneIndex } from '@/core/scene/scene-index';
import type { Node, RectangleNode } from '@/core/schema/document';
import { SceneRenderer } from './scene-renderer';

const require = createRequire(import.meta.url);
let ck: CanvasKit;

beforeAll(async () => {
  const init = require('canvaskit-wasm/bin/full/canvaskit.js') as (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>;
  ck = await init({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });
});

const W = 80;
const H = 80;

/** Renders one unfilled black-stroked 40×40 rectangle at (20, 20) with the given overrides. */
function render(patch: Partial<RectangleNode>) {
  const ids = new IdGenerator('k');
  const store = createEmptyDocument({ name: 'K', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const rect = makeRectangle({ id: ids.next(), parent: { id: page, key: keyOnTop(store, page) }, name: 'R', x: 20, y: 20, width: 40, height: 40 });
  store.applyOp({ kind: 'create', node: { ...rect, fills: [], strokes: [solid(BLACK)], ...patch } as Node });
  const surface = ck.MakeSurface(W, H)!;
  const renderer = new SceneRenderer(ck);
  renderer.render(surface.getCanvas(), store, new SceneIndex(store), page, { x: 0, y: 0, zoom: 1, width: W, height: H, dpr: 1 });
  const img = surface.makeImageSnapshot();
  const pixels = img.readPixels(0, 0, { width: W, height: H, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
  img.delete();
  surface.delete();
  renderer.dispose();
  return (x: number, y: number) => pixels[(y * W + x) * 4]! < 100;
}

describe('stroke styles', () => {
  test('dashed strokes leave gaps along the edge', () => {
    const solidStroke = render({ strokeWeight: 2, strokeAlign: 'CENTER' });
    const dashed = render({ strokeWeight: 2, strokeAlign: 'CENTER', strokeDashes: [4, 4] });
    const topEdge = Array.from({ length: 30 }, (_, i) => 25 + i);
    expect(topEdge.every((x) => solidStroke(x, 20))).toBe(true);
    expect(topEdge.some((x) => dashed(x, 20))).toBe(true);
    expect(topEdge.some((x) => !dashed(x, 20))).toBe(true);
  });

  test('miter joins fill the outer corner; round joins leave it empty', () => {
    const miter = render({ strokeWeight: 10, strokeAlign: 'OUTSIDE' });
    const round = render({ strokeWeight: 10, strokeAlign: 'OUTSIDE', strokeJoin: 'ROUND' });
    expect(miter(11, 11)).toBe(true);
    expect(round(11, 11)).toBe(false);
    // Both cover the middle of the edge.
    expect(round(40, 15)).toBe(true);
  });

  test('individual stroke weights draw only the chosen sides', () => {
    const top = render({ strokeWeight: 1, strokeAlign: 'INSIDE', individualStrokeWeights: { top: 4, right: 0, bottom: 0, left: 0 } });
    expect(top(40, 21)).toBe(true);
    expect(top(40, 23)).toBe(true);
    expect(top(40, 25)).toBe(false);
    expect(top(40, 58)).toBe(false);
    expect(top(21, 40)).toBe(false);
  });
});

describe('path trim', () => {
  /** The middles of the rectangle's four edges, which a quarter of its path covers one of. */
  const edges = [
    [40, 20],
    [60, 40],
    [40, 60],
    [20, 40],
  ] as const;
  const drawn = (at: (x: number, y: number) => boolean) => edges.filter(([x, y]) => at(x, y)).length;
  const trimmed = (patch: Partial<RectangleNode>) => render({ strokeWeight: 2, strokeAlign: 'CENTER', ...patch });

  test('draws only the share of the path between its trim points', () => {
    expect(drawn(trimmed({}))).toBe(4);
    const half = trimmed({ strokeTrimEnd: 0.5 });
    const rest = trimmed({ strokeTrimStart: 0.5 });
    expect(drawn(half)).toBe(2);
    expect(drawn(rest)).toBe(2);
    // The two halves are the path between them: every edge belongs to one or the other.
    expect(edges.every(([x, y]) => half(x, y) !== rest(x, y))).toBe(true);
    // Trimmed down to nothing, no stroke is drawn at all.
    expect(drawn(trimmed({ strokeTrimEnd: 0 }))).toBe(0);
  });

  test('wraps back around the path when it starts past where it ends', () => {
    const spinner = trimmed({ strokeTrimStart: 0.75, strokeTrimEnd: 0.25 });
    expect(drawn(spinner)).toBe(2);
    // The quarters left out are the ones in the middle, which the trim runs around rather than through.
    const middle = trimmed({ strokeTrimStart: 0.25, strokeTrimEnd: 0.75 });
    expect(edges.every(([x, y]) => spinner(x, y) !== middle(x, y))).toBe(true);
  });

  test('is left out of account on a stroke that is not centered', () => {
    // An inside stroke sits within the edge rather than over it, so it is sampled just inside the corners.
    const within = [
      [40, 21],
      [59, 40],
      [40, 59],
      [21, 40],
    ] as const;
    const inside = render({ strokeWeight: 2, strokeAlign: 'INSIDE' });
    const asked = render({ strokeWeight: 2, strokeAlign: 'INSIDE', strokeTrimEnd: 0.5 });
    expect(within.every(([x, y]) => inside(x, y))).toBe(true);
    expect(within.every(([x, y]) => inside(x, y) === asked(x, y))).toBe(true);
  });
});
