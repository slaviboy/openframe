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
import { createEmptyDocument, keyOnTop, makeEllipse, makeRectangle, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { SceneIndex } from '@/core/scene/scene-index';
import type { Color, Node, SceneNode } from '@/core/schema/document';
import { SceneRenderer } from './scene-renderer';

const require = createRequire(import.meta.url);
let ck: CanvasKit;
const W = 100;
const H = 100;

beforeAll(async () => {
  const init = require('canvaskit-wasm/bin/full/canvaskit.js') as (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>;
  ck = await init({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });
});

const RED: Color = { r: 1, g: 0, b: 0, a: 1 };
const BLACK: Color = { r: 0, g: 0, b: 0, a: 1 };
const WHITE: Color = { r: 1, g: 1, b: 1, a: 1 };
const BACKGROUND = [245, 245, 245];

/** A circular mask (below) under a red square (above), both 100×100. */
function render(mask: Partial<SceneNode>, maskFill: Color = BLACK, maskOpacity = 1) {
  const ids = new IdGenerator('q');
  const store = createEmptyDocument({ name: 'M', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const add = (node: Node) => store.applyOp({ kind: 'create', node });
  add({
    ...makeEllipse({ id: ids.next(), parent: { id: page, key: keyOnTop(store, page) }, name: 'Mask', x: 0, y: 0, width: 100, height: 100 }),
    fills: [solid(maskFill, maskOpacity)],
    isMask: true,
    ...mask,
  } as Node);
  add({ ...makeRectangle({ id: ids.next(), parent: { id: page, key: keyOnTop(store, page) }, name: 'R', x: 0, y: 0, width: 100, height: 100 }), fills: [solid(RED)] });
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

describe('mask rendering', () => {
  test('alpha masks show content inside the mask only, and the mask itself is not drawn', () => {
    const at = render({});
    expect(at(50, 50)).toEqual([255, 0, 0]);
    expect(at(3, 3)).toEqual(BACKGROUND);
  });

  test('alpha masks follow mask opacity; vector masks treat any coverage as opaque', () => {
    const alpha = render({}, BLACK, 0.3);
    expect(alpha(50, 50)[1]).toBeGreaterThan(100);
    const vector = render({ maskType: 'VECTOR' }, BLACK, 0.3);
    expect(vector(50, 50)).toEqual([255, 0, 0]);
    expect(vector(3, 3)).toEqual(BACKGROUND);
  });

  test('luminance masks reveal by brightness; hidden masks mask nothing', () => {
    expect(render({ maskType: 'LUMINANCE' }, WHITE)(50, 50)).toEqual([255, 0, 0]);
    expect(render({ maskType: 'LUMINANCE' }, BLACK)(50, 50)).toEqual(BACKGROUND);
    const hidden = render({ visible: false });
    expect(hidden(3, 3)).toEqual([255, 0, 0]);
  });
});
