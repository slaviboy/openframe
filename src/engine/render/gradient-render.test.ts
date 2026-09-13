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
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { SceneIndex } from '@/core/scene/scene-index';
import type { GradientType, Node, Paint } from '@/core/schema/document';
import { SceneRenderer } from './scene-renderer';

const require = createRequire(import.meta.url);
let ck: CanvasKit;

beforeAll(async () => {
  const init = require('canvaskit-wasm/bin/full/canvaskit.js') as (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>;
  ck = await init({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });
});

const SIZE = 100;

function render(type: GradientType, transform: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0]) {
  const ids = new IdGenerator('g');
  const store = createEmptyDocument({ name: 'G', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const paint: Paint = {
    type,
    gradientStops: [
      { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
      { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
    ],
    gradientTransform: transform,
    opacity: 1,
    visible: true,
    blendMode: 'NORMAL',
  };
  const rect = makeRectangle({ id: ids.next(), parent: { id: page, key: keyOnTop(store, page) }, name: 'R', x: 0, y: 0, width: SIZE, height: SIZE });
  store.applyOp({ kind: 'create', node: { ...rect, fills: [paint] } as Node });
  const surface = ck.MakeSurface(SIZE, SIZE)!;
  const renderer = new SceneRenderer(ck);
  renderer.render(surface.getCanvas(), store, new SceneIndex(store), page, { x: 0, y: 0, zoom: 1, width: SIZE, height: SIZE, dpr: 1 });
  const img = surface.makeImageSnapshot();
  const pixels = img.readPixels(0, 0, { width: SIZE, height: SIZE, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
  img.delete();
  surface.delete();
  renderer.dispose();
  return (x: number, y: number) => {
    const i = (y * SIZE + x) * 4;
    return { r: pixels[i]!, b: pixels[i + 2]! };
  };
}

const reddish = (p: { r: number; b: number }) => p.r > 200 && p.b < 60;
const bluish = (p: { r: number; b: number }) => p.b > 200 && p.r < 60;

describe('gradient fills', () => {
  test('linear runs left to right, and the transform can rotate it', () => {
    const at = render('GRADIENT_LINEAR');
    expect(reddish(at(1, 50))).toBe(true);
    expect(bluish(at(98, 50))).toBe(true);
    // 90° rotation about the layer center: top to bottom.
    const vertical = render('GRADIENT_LINEAR', [0, 1, -1, 0, 1, 0]);
    expect(reddish(vertical(50, 1))).toBe(true);
    expect(bluish(vertical(50, 98))).toBe(true);
  });

  test('radial is red at the center and blue at the edge', () => {
    const at = render('GRADIENT_RADIAL');
    expect(reddish(at(50, 50))).toBe(true);
    expect(bluish(at(50, 1))).toBe(true);
  });

  test('angular sweeps clockwise from the right', () => {
    const at = render('GRADIENT_ANGULAR');
    // Just below the start direction (small angle) vs just above it (almost a full turn).
    expect(reddish(at(95, 52))).toBe(true);
    expect(bluish(at(95, 48))).toBe(true);
  });

  test('diamond is red at the center and blue at the diamond tips', () => {
    const at = render('GRADIENT_DIAMOND');
    expect(reddish(at(50, 50))).toBe(true);
    expect(bluish(at(99, 50))).toBe(true);
    expect(bluish(at(76, 76))).toBe(true);
    // Along the axis at the same distance, the diamond is still halfway.
    expect(reddish(at(76, 50)) || bluish(at(76, 50))).toBe(false);
  });
});
