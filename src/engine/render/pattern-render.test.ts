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
import { convertPaint } from '@/core/color/paints';
import { createEmptyDocument, keyOnTop, makeRectangle, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { SceneIndex } from '@/core/scene/scene-index';
import type { Node, PatternPaint } from '@/core/schema/document';
import { SceneRenderer } from './scene-renderer';

const require = createRequire(import.meta.url);
let ck: CanvasKit;
const W = 120;
const H = 60;

beforeAll(async () => {
  const init = require('canvaskit-wasm/bin/full/canvaskit.js') as (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>;
  ck = await init({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });
});

const RED = { r: 1, g: 0, b: 0, a: 1 };
const BACKGROUND = [245, 245, 245];

/** A 10×10 red source far off-screen and a 120×40 layer at (0, 0) filled with its pattern. */
function render(patch: Partial<PatternPaint> = {}, selfReference = false) {
  const ids = new IdGenerator('n');
  const store = createEmptyDocument({ name: 'P', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const add = (node: Node) => store.applyOp({ kind: 'create', node });
  const sourceId = ids.next();
  add({ ...makeRectangle({ id: sourceId, parent: { id: page, key: keyOnTop(store, page) }, name: 'S', x: 500, y: 500, width: 10, height: 10 }), fills: [solid(RED)] } as Node);
  const targetId = ids.next();
  const pattern: PatternPaint = { ...(convertPaint(solid(RED), 'PATTERN') as PatternPaint), sourceNodeId: selfReference ? targetId : sourceId, spacing: { x: 10, y: 10 }, ...patch };
  add({ ...makeRectangle({ id: targetId, parent: { id: page, key: keyOnTop(store, page) }, name: 'T', x: 0, y: 0, width: 120, height: 40 }), fills: [pattern] } as Node);
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

describe('pattern fills', () => {
  test('the source repeats with spacing inside the layer only', () => {
    const at = render();
    expect(at(5, 5)).toEqual([255, 0, 0]);
    expect(at(15, 5)).toEqual(BACKGROUND);
    expect(at(25, 5)).toEqual([255, 0, 0]);
    expect(at(25, 25)).toEqual([255, 0, 0]);
    // Below the layer nothing is drawn.
    expect(at(5, 45)).toEqual(BACKGROUND);
  });

  test('scale, hexagonal rows and alignment move the tiles', () => {
    const scaled = render({ scalingFactor: 2 });
    expect(scaled(15, 15)).toEqual([255, 0, 0]);
    expect(scaled(25, 5)).toEqual(BACKGROUND);
    const hex = render({ tileType: 'HORIZONTAL_HEXAGONAL' });
    // The second row shifts by half a 20px cell.
    expect(hex(5, 25)).toEqual(BACKGROUND);
    expect(hex(15, 25)).toEqual([255, 0, 0]);
    const centered = render({ horizontalAlignment: 'CENTER' });
    // A tile is centered on x = 60: it spans 55–65.
    expect(centered(60, 5)).toEqual([255, 0, 0]);
    expect(centered(50, 5)).toEqual(BACKGROUND);
  });

  test('a pattern of itself or of a missing layer draws nothing and does not recurse', () => {
    expect(render({}, true)(5, 5)).toEqual(BACKGROUND);
    expect(render({ sourceNodeId: 'zz:999' })(5, 5)).toEqual(BACKGROUND);
  });
});
