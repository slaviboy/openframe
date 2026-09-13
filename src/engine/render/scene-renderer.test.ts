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

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeEllipse, makeFrame, makeRectangle, solid } from '@/core/document/factory';
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

function scene() {
  const ids = new IdGenerator('g');
  const store = createEmptyDocument({ name: 'G', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  const add = (node: Node) => store.applyOp({ kind: 'create', node });
  const frame = makeFrame({ id: ids.next(), parent: { id: page, key: keyOnTop(store, page) }, name: 'F', x: 10, y: 10, width: 100, height: 80 });
  add({ ...frame, cornerRadius: 12, strokes: [solid({ r: 0, g: 0, b: 0, a: 1 })], strokeWeight: 2 });
  const red = { r: 1, g: 0, b: 0, a: 1 };
  const rect = makeRectangle({ id: ids.next(), parent: { id: frame.id, key: keyOnTop(store, frame.id) }, name: 'R', x: 60, y: 40, width: 80, height: 80 });
  add({ ...rect, fills: [solid(red)] });
  const ellipse = makeEllipse({ id: ids.next(), parent: { id: page, key: keyOnTop(store, page) }, name: 'E', x: 120, y: 20, width: 60, height: 60 });
  add({ ...ellipse, fills: [solid({ r: 0, g: 0.6, b: 1, a: 1 })], opacity: 0.5, blendMode: 'MULTIPLY' });
  return { store, page, index: new SceneIndex(store), frame: frame.id };
}

function renderToPixels(view = { x: 0, y: 0, zoom: 1, width: 200, height: 140, dpr: 1 }) {
  const { store, page, index } = scene();
  const surface = ck.MakeSurface(view.width * view.dpr, view.height * view.dpr)!;
  const renderer = new SceneRenderer(ck);
  const stats = renderer.render(surface.getCanvas(), store, index, page, view);
  const img = surface.makeImageSnapshot();
  const pixels = img.readPixels(0, 0, {
    width: view.width * view.dpr,
    height: view.height * view.dpr,
    colorType: ck.ColorType.RGBA_8888,
    alphaType: ck.AlphaType.Unpremul,
    colorSpace: ck.ColorSpace.SRGB,
  }) as Uint8Array;
  img.delete();
  surface.delete();
  renderer.dispose();
  const at = (x: number, y: number) => Array.from(pixels.slice((y * view.width * view.dpr + x) * 4, (y * view.width * view.dpr + x) * 4 + 4));
  return { pixels, at, stats };
}

describe('SceneRenderer (CanvasKit CPU surface)', () => {
  test('renders deterministically', () => {
    const a = createHash('sha256').update(renderToPixels().pixels).digest('hex');
    const b = createHash('sha256').update(renderToPixels().pixels).digest('hex');
    expect(a).toBe(b);
  });

  test('page background, frame fill, child clipping, stroke and blend', () => {
    const { at } = renderToPixels();
    // Canvas background #F5F5F5 outside everything.
    expect(at(2, 130)).toEqual([245, 245, 245, 255]);
    // Frame interior white.
    expect(at(30, 40)).toEqual([255, 255, 255, 255]);
    // Red child inside frame.
    expect(at(90, 70)).toEqual([255, 0, 0, 255]);
    // Red child clipped by frame (outside frame bounds at y=100+ inside rect) → background.
    expect(at(90, 110)).toEqual([245, 245, 245, 255]);
    // Inside stroke on frame left edge (x=10..12) is black.
    const edge = at(11, 50);
    expect(edge[0]).toBeLessThan(40);
    // Ellipse (#0099FF, 50% layer opacity, multiply) over the #F5F5F5 canvas, outside the frame:
    // result = bg·(1−α) + bg·color·α → (122.5, 196, 245).
    const over = at(125, 50);
    expect(Math.abs(over[0]! - 123)).toBeLessThanOrEqual(2);
    expect(Math.abs(over[1]! - 196)).toBeLessThanOrEqual(2);
    expect(Math.abs(over[2]! - 245)).toBeLessThanOrEqual(2);
  });

  test('culls nodes outside the viewport', () => {
    const { stats } = renderToPixels({ x: 1000, y: 1000, zoom: 1, width: 200, height: 140, dpr: 1 });
    expect(stats.drawn).toBe(0);
    expect(stats.culled).toBeGreaterThan(0);
  });

  test('zoom and dpr scale the scene', () => {
    const { at } = renderToPixels({ x: 0, y: 0, zoom: 2, width: 200, height: 140, dpr: 1 });
    // Frame now spans x 20..220 → white at (60, 60)
    expect(at(60, 60)).toEqual([255, 255, 255, 255]);
  });
});
