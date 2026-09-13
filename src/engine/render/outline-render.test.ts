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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { SceneIndex } from '@/core/scene/scene-index';
import type { Node } from '@/core/schema/document';
import { SceneRenderer, type RenderOptions } from './scene-renderer';

const require = createRequire(import.meta.url);
let ck: CanvasKit;

beforeAll(async () => {
  const init = require('canvaskit-wasm/bin/full/canvaskit.js') as (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>;
  ck = await init({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });
});

const W = 200;
const H = 120;
const BG = [245, 245, 245];

function render(options: RenderOptions) {
  const ids = new IdGenerator('o');
  const store = createEmptyDocument({ name: 'O', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const add = (node: Node) => store.applyOp({ kind: 'create', node });
  const frame = makeFrame({ id: ids.next(), parent: { id: page, key: keyOnTop(store, page) }, name: 'F', x: 10, y: 10, width: 60, height: 60 });
  add(frame);
  // Overflows its clipping frame: clipped normally, fully outlined in outline mode.
  add({ ...makeRectangle({ id: ids.next(), parent: { id: frame.id, key: keyOnTop(store, frame.id) }, name: 'R', x: 30, y: 30, width: 60, height: 40 }), fills: [solid({ r: 1, g: 0, b: 0, a: 1 })] });
  add({ ...makeRectangle({ id: ids.next(), parent: { id: page, key: keyOnTop(store, page) }, name: 'H', x: 120, y: 20, width: 50, height: 50 }), visible: false });
  const surface = ck.MakeSurface(W, H)!;
  const renderer = new SceneRenderer(ck);
  renderer.render(surface.getCanvas(), store, new SceneIndex(store), page, { x: 0, y: 0, zoom: 1, width: W, height: H, dpr: 1 }, options);
  const img = surface.makeImageSnapshot();
  const pixels = img.readPixels(0, 0, { width: W, height: H, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
  img.delete();
  surface.delete();
  renderer.dispose();
  return (x: number, y: number) => Array.from(pixels.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
}

const dark = (px: number[]) => px.every((c) => c < 140);

describe('outline mode', () => {
  test('fills disappear and every layer, including clipped content, gets a hairline outline', () => {
    const normal = render({});
    expect(normal(55, 55)).toEqual([255, 0, 0]);
    expect(normal(85, 55)).toEqual(BG);

    const outlined = render({ outlines: true });
    expect(outlined(55, 55)).toEqual(BG);
    // Right edge of the rectangle at x = 100, outside the frame's clip.
    expect(dark(outlined(100, 60))).toBe(true);
    // Frame's top edge.
    expect(dark(outlined(40, 10))).toBe(true);
    // Hidden layers are skipped unless requested.
    expect(outlined(145, 20)).toEqual(BG);
    expect(dark(render({ outlines: true, includeHidden: true })(145, 20))).toBe(true);
  });
});
