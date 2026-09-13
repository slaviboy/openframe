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
import { createEmptyDocument, keyOnTop, makeLine, makePolygon, makeStar, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { SceneIndex } from '@/core/scene/scene-index';
import type { Node } from '@/core/schema/document';
import { SceneRenderer } from './scene-renderer';

const require = createRequire(import.meta.url);
let ck: CanvasKit;

beforeAll(async () => {
  const init = require('canvaskit-wasm/bin/full/canvaskit.js') as (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>;
  ck = await init({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });
});

const RED = { r: 1, g: 0, b: 0, a: 1 };
const W = 320;
const H = 160;

function render(extra: Partial<Record<'line' | 'polygon' | 'star', Partial<Node>>> = {}) {
  const ids = new IdGenerator('s');
  const store = createEmptyDocument({ name: 'S', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const parent = () => ({ id: page, key: keyOnTop(store, page) });
  const add = (node: Node) => store.applyOp({ kind: 'create', node });
  add({ ...makePolygon({ id: ids.next(), parent: parent(), name: 'P', x: 0, y: 0, width: 100, height: 100 }), fills: [solid(RED)], ...extra.polygon } as Node);
  add({ ...makeStar({ id: ids.next(), parent: parent(), name: 'S', x: 200, y: 0, width: 100, height: 100 }), fills: [solid(RED)], ...extra.star } as Node);
  add({
    ...makeLine({ id: ids.next(), parent: parent(), name: 'L', x: 10, y: 130, width: 180, height: 0 }, 'TRIANGLE_ARROW'),
    strokeWeight: 4,
    ...extra.line,
  } as Node);
  const surface = ck.MakeSurface(W, H)!;
  const renderer = new SceneRenderer(ck);
  renderer.render(surface.getCanvas(), store, new SceneIndex(store), page, { x: 0, y: 0, zoom: 1, width: W, height: H, dpr: 1 });
  const img = surface.makeImageSnapshot();
  const pixels = img.readPixels(0, 0, { width: W, height: H, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
  img.delete();
  surface.delete();
  renderer.dispose();
  return (x: number, y: number) => Array.from(pixels.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
}

const BACKGROUND = [245, 245, 245];

describe('shape rendering', () => {
  test('polygons and stars fill their outlines', () => {
    const at = render();
    expect(at(50, 80)).toEqual([255, 0, 0]);
    expect(at(5, 5)).toEqual(BACKGROUND);
    expect(at(250, 55)).toEqual([255, 0, 0]);
    // Between the top and upper-right arms of the star.
    expect(at(272, 24)).toEqual(BACKGROUND);
  });

  test('a corner radius rounds polygon and star vertices', () => {
    const sharp = render();
    const round = render({ polygon: { cornerRadius: 20 }, star: { cornerRadius: 6 } });
    // The triangle apex sits at (50, 0): a sharp tip reaches it, a rounded one falls short.
    expect(sharp(50, 4)).toEqual([255, 0, 0]);
    expect(round(50, 4)).toEqual(BACKGROUND);
    expect(round(50, 80)).toEqual([255, 0, 0]);
    // A star tip is thinner than a pixel, so compare painted coverage around the top tip.
    const coverage = (at: ReturnType<typeof render>) => {
      let sum = 0;
      for (let y = 0; y < 12; y++) for (let x = 244; x <= 256; x++) sum += 245 - at(x, y)[1]!;
      return sum;
    };
    expect(coverage(round)).toBeLessThan(coverage(sharp) * 0.7);
    expect(round(250, 55)).toEqual([255, 0, 0]);
  });

  test('lines stroke on center and draw end markers', () => {
    const at = render();
    expect(at(100, 130)).toEqual([0, 0, 0]);
    expect(at(100, 135)).toEqual(BACKGROUND);
    // Inside the triangle arrow head near the end point, beyond the 4px stroke.
    expect(at(180, 134)).toEqual([0, 0, 0]);
    const plain = render({ line: { endCap: 'NONE' } as Partial<Node> });
    expect(plain(180, 134)).toEqual(BACKGROUND);
  });

  test('round and square caps extend past the end point', () => {
    const butt = render({ line: { endCap: 'NONE' } as Partial<Node> });
    const square = render({ line: { endCap: 'SQUARE' } as Partial<Node> });
    expect(butt(191, 130)).toEqual(BACKGROUND);
    expect(square(191, 130)).toEqual([0, 0, 0]);
  });
});
