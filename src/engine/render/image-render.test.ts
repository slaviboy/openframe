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
import { adjustColor } from '@/core/image/adjustments';
import type { ImageFilters, ImagePaint } from '@/core/schema/document';
import { SceneRenderer, type ImageSource } from './scene-renderer';

const require = createRequire(import.meta.url);
let ck: CanvasKit;
/** An 8×4 PNG: red on the left half, blue on the right half. */
let png: Uint8Array;
const HASH = 'f'.repeat(64);
const W = 120;
const H = 120;

beforeAll(async () => {
  const init = require('canvaskit-wasm/bin/full/canvaskit.js') as (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>;
  ck = await init({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });
  const surface = ck.MakeSurface(8, 4)!;
  const canvas = surface.getCanvas();
  const paint = new ck.Paint();
  paint.setColor(ck.Color4f(1, 0, 0, 1));
  canvas.drawRect(ck.LTRBRect(0, 0, 4, 4), paint);
  paint.setColor(ck.Color4f(0, 0, 1, 1));
  canvas.drawRect(ck.LTRBRect(4, 0, 8, 4), paint);
  const image = surface.makeImageSnapshot();
  png = image.encodeToBytes()!;
  image.delete();
  paint.delete();
  surface.delete();
  const swatchSurface = ck.MakeSurface(4, 4)!;
  swatchSurface.getCanvas().clear(ck.Color(SWATCH[0], SWATCH[1], SWATCH[2], 1));
  const swatchImage = swatchSurface.makeImageSnapshot();
  swatch = swatchImage.encodeToBytes()!;
  swatchImage.delete();
  swatchSurface.delete();
});

/** A solid 4×4 PNG for adjustment tests. */
let swatch: Uint8Array;
const SWATCH = [200, 110, 60] as const;
const SWATCH_HASH = 'd'.repeat(64);

function render(paint: Partial<ImagePaint>, size = { width: 100, height: 50 }, source?: ImageSource) {
  const ids = new IdGenerator('i');
  const store = createEmptyDocument({ name: 'I', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const fill: ImagePaint = { type: 'IMAGE', imageHash: HASH, scaleMode: 'FILL', opacity: 1, visible: true, blendMode: 'NORMAL', ...paint };
  store.applyOp({
    kind: 'create',
    node: { ...makeRectangle({ id: ids.next(), parent: { id: page, key: keyOnTop(store, page) }, name: 'R', x: 0, y: 0, ...size }), fills: [fill] },
  });
  const requested: string[] = [];
  const images: ImageSource = source ?? {
    get: (hash) => (hash === HASH ? { bytes: png } : hash === SWATCH_HASH ? { bytes: swatch } : undefined),
    request: (hash) => requested.push(hash),
  };
  const surface = ck.MakeSurface(W, H)!;
  const renderer = new SceneRenderer(ck, images);
  renderer.render(surface.getCanvas(), store, new SceneIndex(store), page, { x: 0, y: 0, zoom: 1, width: W, height: H, dpr: 1 });
  const img = surface.makeImageSnapshot();
  const pixels = img.readPixels(0, 0, { width: W, height: H, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
  img.delete();
  surface.delete();
  renderer.dispose();
  const at = (x: number, y: number) => Array.from(pixels.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
  return { at, requested };
}

const RED = [255, 0, 0];
const BLUE = [0, 0, 255];
const BACKGROUND = [245, 245, 245];

describe('image fills', () => {
  test('FILL stretches a matching aspect ratio across the layer', () => {
    const { at } = render({ scaleMode: 'FILL' });
    expect(at(25, 25)).toEqual(RED);
    expect(at(75, 25)).toEqual(BLUE);
  });

  test('FIT letterboxes; TILE repeats; rotation turns the image', () => {
    const fit = render({ scaleMode: 'FIT' }, { width: 100, height: 100 });
    expect(fit.at(25, 50)).toEqual(RED);
    expect(fit.at(50, 10)).toEqual(BACKGROUND);
    // 10× tiles are 80×40: red, blue, then red again from the next tile.
    const tile = render({ scaleMode: 'TILE', scalingFactor: 10 }, { width: 110, height: 50 });
    expect(tile.at(20, 20)).toEqual(RED);
    expect(tile.at(60, 20)).toEqual(BLUE);
    expect(tile.at(100, 20)).toEqual(RED);
    const turned = render({ scaleMode: 'FILL', rotation: 90 }, { width: 50, height: 100 });
    expect(turned.at(25, 25)).toEqual(RED);
    expect(turned.at(25, 75)).toEqual(BLUE);
  });

  test('missing images are requested and drawn as a checkerboard, as are placeholders', () => {
    const missing = render({ imageHash: 'e'.repeat(64) });
    expect(missing.requested).toEqual(['e'.repeat(64)]);
    expect(missing.at(4, 4)).toEqual([255, 255, 255]);
    expect(missing.at(12, 4)).toEqual([204, 204, 204]);
    const placeholder = render({ imageHash: undefined });
    expect(placeholder.at(12, 12)).toEqual([255, 255, 255]);
  });

  test('adjustments match the reference color math', () => {
    const cases: ImageFilters[] = [
      { saturation: -1 },
      { exposure: 0.5, contrast: 0.3 },
      { temperature: -0.4, tint: 0.6 },
      { highlights: 0.8, shadows: -0.5, contrast: -0.2 },
    ];
    for (const filters of cases) {
      const { at } = render({ imageHash: SWATCH_HASH, filters }, { width: 40, height: 40 });
      const expected = adjustColor([SWATCH[0] / 255, SWATCH[1] / 255, SWATCH[2] / 255], filters).map((v) => v * 255);
      at(20, 20).forEach((v, i) => expect(Math.abs(v - expected[i]!)).toBeLessThanOrEqual(2));
    }
    // Without adjustments the swatch draws as-is.
    expect(render({ imageHash: SWATCH_HASH }, { width: 40, height: 40 }).at(20, 20)).toEqual([...SWATCH]);
  });
});
