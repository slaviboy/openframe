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
