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
import { createEmptyDocument, makeFrame, makeRectangle, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { SceneIndex } from '@/core/scene/scene-index';
import type { Effect, Node } from '@/core/schema/document';
import { SceneRenderer } from './scene-renderer';

const require = createRequire(import.meta.url);
let ck: CanvasKit;

beforeAll(async () => {
  const init = require('canvaskit-wasm/bin/full/canvaskit.js') as (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>;
  ck = await init({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });
});

const W = 80;
const H = 80;
const WHITE = { r: 1, g: 1, b: 1, a: 1 };
const RED = { r: 1, g: 0, b: 0, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };

type Build = (add: (node: Node) => void, ids: IdGenerator, page: string) => void;

function render(build: Build) {
  const ids = new IdGenerator('e');
  const store = createEmptyDocument({ name: 'E', now: 'n', appVersion: 't', ids });
  const page = store.pages()[0]!;
  build((node) => store.applyOp({ kind: 'create', node }), ids, page);
  const surface = ck.MakeSurface(W, H)!;
  const renderer = new SceneRenderer(ck);
  renderer.render(surface.getCanvas(), store, new SceneIndex(store), page, { x: 0, y: 0, zoom: 1, width: W, height: H, dpr: 1 });
  const img = surface.makeImageSnapshot();
  const pixels = img.readPixels(0, 0, { width: W, height: H, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
  img.delete();
  surface.delete();
  renderer.dispose();
  return (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return { r: pixels[i]!, g: pixels[i + 1]!, b: pixels[i + 2]! };
  };
}

/** A 40×40 rectangle at (20, 20) with the given fill and effects. */
const rect = (effects: Effect[], fill = WHITE, fillOpacity = 1): Build => (add, ids, page) => {
  const node = makeRectangle({ id: ids.next(), parent: { id: page, key: 'V' }, name: 'R', x: 20, y: 20, width: 40, height: 40 });
  add({ ...node, fills: [solid(fill, fillOpacity)], effects } as Node);
};

const shadow = (type: 'DROP_SHADOW' | 'INNER_SHADOW', patch: Record<string, unknown> = {}): Effect =>
  ({ type, color: BLACK, offset: { x: 0, y: 8 }, radius: 0, spread: 0, visible: true, blendMode: 'NORMAL', ...(type === 'DROP_SHADOW' ? { showShadowBehindNode: false } : {}), ...patch }) as Effect;

const dark = (p: { r: number }) => p.r < 60;

describe('effects rendering', () => {
  test('drop shadow draws below the layer, offset and outside its bounds', () => {
    const at = render(rect([shadow('DROP_SHADOW')]));
    expect(dark(at(40, 64))).toBe(true);
    expect(dark(at(40, 70))).toBe(false);
    expect(dark(at(40, 50))).toBe(false);
  });

  test('drop shadows are knocked out under translucent fills unless shown behind', () => {
    const hidden = render(rect([shadow('DROP_SHADOW')], WHITE, 0.3));
    const shown = render(rect([shadow('DROP_SHADOW', { showShadowBehindNode: true })], WHITE, 0.3));
    expect(dark(hidden(40, 56))).toBe(false);
    // The shadow takes its opacity from the content (a 30% fill casts a 30% shadow), so "shown" is clearly but not fully darker.
    expect(shown(40, 56).r).toBeLessThan(hidden(40, 56).r - 30);
  });

  test('inner shadow darkens the inside edge opposite the offset', () => {
    const at = render(rect([shadow('INNER_SHADOW')]));
    expect(dark(at(40, 23))).toBe(true);
    expect(dark(at(40, 45))).toBe(false);
    // Nothing is drawn outside the layer.
    expect(dark(at(40, 14))).toBe(false);
  });

  test('layer blur softens the layer edge', () => {
    const sharp = render(rect([], RED));
    const blurred = render(rect([{ type: 'LAYER_BLUR', radius: 12, visible: true }], RED));
    const outside = (p: { r: number; g: number }) => p.r - p.g;
    expect(outside(sharp(40, 63))).toBeLessThan(10);
    expect(outside(blurred(40, 63))).toBeGreaterThan(20);
  });

  test('background blur blurs what is behind the layer within its shape', () => {
    const scene = (blur: boolean): Build => (add, ids, page) => {
      // Keys order the siblings: 'U' (backdrop) paints below 'W' (glass).
      const back = makeRectangle({ id: ids.next(), parent: { id: page, key: 'U' }, name: 'B', x: 0, y: 0, width: 40, height: 80 });
      add({ ...back, fills: [solid(BLACK)] } as Node);
      const glass = makeFrame({ id: ids.next(), parent: { id: page, key: 'W' }, name: 'G', x: 20, y: 20, width: 40, height: 40 });
      add({ ...glass, fills: [solid(WHITE, 0.01)], effects: blur ? [{ type: 'BACKGROUND_BLUR', radius: 16, visible: true }] : [] } as Node);
    };
    const plain = render(scene(false));
    const blurred = render(scene(true));
    expect(plain(37, 40).r).toBeLessThan(10);
    expect(blurred(37, 40).r).toBeGreaterThan(30);
    // Outside the glass layer the backdrop stays sharp.
    expect(blurred(10, 10).r).toBeLessThan(10);
  });

  test('drop shadow blend modes blend the shadow with what is behind the layer', () => {
    const scene =
      (blendMode: string): Build =>
      (add, ids, page) => {
        add({ ...makeRectangle({ id: ids.next(), parent: { id: page, key: 'A' }, name: 'G', x: 0, y: 0, width: 80, height: 80 }), fills: [solid({ r: 0, g: 1, b: 0, a: 1 })] } as Node);
        const node = makeRectangle({ id: ids.next(), parent: { id: page, key: 'V' }, name: 'R', x: 20, y: 20, width: 40, height: 40 });
        add({ ...node, fills: [solid(WHITE)], effects: [shadow('DROP_SHADOW', { color: RED, blendMode })] } as Node);
      };
    // Just below the layer the shadow lies on the green backdrop.
    const normal = render(scene('NORMAL'))(40, 64);
    expect(normal.r).toBeGreaterThan(240);
    expect(normal.g).toBeLessThan(20);
    // Red multiplied with green is black.
    const multiply = render(scene('MULTIPLY'));
    expect(multiply(40, 64).r).toBeLessThan(20);
    expect(multiply(40, 64).g).toBeLessThan(20);
    // The layer itself and the uncovered backdrop are unchanged.
    expect(multiply(40, 40)).toEqual({ r: 255, g: 255, b: 255 });
    expect(multiply(5, 5)).toEqual({ r: 0, g: 255, b: 0 });
  });

  test('progressive layer blur is sharp at the start and blurred at the end', () => {
    const progressive: Effect = { type: 'LAYER_BLUR', radius: 16, visible: true, blurType: 'PROGRESSIVE', startRadius: 0, startOffset: { x: 0.5, y: 0 }, endOffset: { x: 0.5, y: 1 } };
    const at = render(rect([progressive], BLACK));
    // Just outside the left edge: untouched near the top (start), darkened by blur near the bottom (end).
    expect(at(18, 21).r).toBeGreaterThan(235);
    expect(at(18, 58).r).toBeLessThan(225);
    // Inside near the start the fill stays solid.
    expect(at(22, 21).r).toBeLessThan(20);
    // The same blur as uniform darkens both ends.
    const uniform = render(rect([{ type: 'LAYER_BLUR', radius: 16, visible: true }], BLACK));
    expect(uniform(18, 21).r).toBeLessThan(225);
  });

  test('progressive background blur ramps along its direction', () => {
    const glass =
      (effect: Effect): Build =>
      (add, ids, page) => {
        add({ ...makeRectangle({ id: ids.next(), parent: { id: page, key: 'A' }, name: 'Dark', x: 0, y: 0, width: 40, height: 80 }), fills: [solid(BLACK)] } as Node);
        add({ ...makeRectangle({ id: ids.next(), parent: { id: page, key: 'B' }, name: 'Light', x: 40, y: 0, width: 40, height: 80 }), fills: [solid(WHITE)] } as Node);
        add({ ...makeRectangle({ id: ids.next(), parent: { id: page, key: 'V' }, name: 'Glass', x: 20, y: 20, width: 40, height: 40 }), fills: [], effects: [effect] } as Node);
      };
    const at = render(glass({ type: 'BACKGROUND_BLUR', radius: 20, visible: true, blurType: 'PROGRESSIVE', startRadius: 0, startOffset: { x: 0.5, y: 0 }, endOffset: { x: 0.5, y: 1 } }));
    // Just left of the dark/light boundary: still dark near the top of the glass, lightened near its bottom.
    expect(at(38, 21).r).toBeLessThan(20);
    expect(at(38, 58).r).toBeGreaterThan(40);
  });

  test('noise covers the layer content only, following density and type', () => {
    const noise = (patch: Record<string, unknown>): Effect =>
      ({
        type: 'NOISE',
        noiseType: 'MONOTONE',
        noiseSize: 1,
        density: 1,
        color: { r: 0, g: 0, b: 0, a: 1 },
        secondaryColor: { r: 1, g: 1, b: 1, a: 1 },
        opacity: 1,
        visible: true,
        blendMode: 'NORMAL',
        ...patch,
      }) as Effect;
    const full = render(rect([noise({})]));
    expect(full(40, 40).r).toBeLessThan(20);
    expect(full(5, 5)).toEqual({ r: 245, g: 245, b: 245 });
    expect(render(rect([noise({ density: 0 })]))(40, 40)).toEqual({ r: 255, g: 255, b: 255 });
    // Duo mixes both colors; multi produces colored pixels.
    const duo = render(rect([noise({ noiseType: 'DUOTONE' })]));
    const values = new Set<number>();
    for (let y = 30; y < 40; y++) for (let x = 30; x < 40; x++) values.add(duo(x, y).r > 128 ? 1 : 0);
    expect(values.size).toBe(2);
    const multi = render(rect([noise({ noiseType: 'MULTITONE' })]));
    let colored = false;
    for (let y = 30; y < 40 && !colored; y++) for (let x = 30; x < 40; x++) if (Math.abs(multi(x, y).r - multi(x, y).g) > 30) colored = true;
    expect(colored).toBe(true);
  });

  test('texture roughens edges beyond the layer unless clipped to its shape', () => {
    const texture = (clipToShape: boolean): Effect => ({ type: 'TEXTURE', noiseSize: 3, radius: 6, clipToShape, visible: true });
    const outsideDark = (at: ReturnType<typeof render>) => {
      let count = 0;
      for (let y = 22; y < 58; y++) for (let x = 14; x < 20; x++) if (at(x, y).r < 200) count++;
      return count;
    };
    expect(outsideDark(render(rect([texture(false)], BLACK)))).toBeGreaterThan(0);
    expect(outsideDark(render(rect([texture(true)], BLACK)))).toBe(0);
    expect(outsideDark(render(rect([], BLACK)))).toBe(0);
  });

  test('glass frosts, refracts and lights what is behind the layer; the first of glass and background blur renders', () => {
    const glass = (patch: Record<string, unknown>): Effect =>
      ({ type: 'GLASS', lightIntensity: 0, lightAngle: 90, refraction: 0, depth: 10, dispersion: 0, radius: 0, splay: 0, visible: true, ...patch }) as Effect;
    /** Black on x < edge, white elsewhere, and a 40×40 glass layer at (20, 20). */
    const scene =
      (effects: Effect[], edge = 40): Build =>
      (add, ids, page) => {
        add({ ...makeRectangle({ id: ids.next(), parent: { id: page, key: 'A' }, name: 'Dark', x: 0, y: 0, width: edge, height: 80 }), fills: [solid(BLACK)] } as Node);
        add({ ...makeRectangle({ id: ids.next(), parent: { id: page, key: 'B' }, name: 'Light', x: edge, y: 0, width: 80 - edge, height: 80 }), fills: [solid(WHITE)] } as Node);
        add({ ...makeRectangle({ id: ids.next(), parent: { id: page, key: 'V' }, name: 'Glass', x: 20, y: 20, width: 40, height: 40 }), fills: [], effects } as Node);
      };
    // Frost blurs across the dark/light boundary.
    expect(render(scene([glass({})]))(38, 40).r).toBeLessThan(20);
    expect(render(scene([glass({ radius: 20 })]))(38, 40).r).toBeGreaterThan(40);
    // Refraction pulls the backdrop from outside the edge: just inside the left edge the dark strip shows.
    expect(render(scene([glass({})], 22))(24, 40).r).toBeGreaterThan(200);
    expect(render(scene([glass({ refraction: 1 })], 22))(24, 40).r).toBeLessThan(128);
    // Light from the top brightens the top edge more than the middle.
    const lit = render(scene([glass({ lightIntensity: 1 })]));
    expect(lit(30, 21).r).toBeGreaterThan(lit(30, 40).r + 30);
    // Only the first of glass and background blur renders.
    const blur: Effect = { type: 'BACKGROUND_BLUR', radius: 20, visible: true };
    expect(render(scene([glass({}), blur]))(38, 40).r).toBeLessThan(20);
    expect(render(scene([blur, glass({})]))(38, 40).r).toBeGreaterThan(40);
  });

  test('inner shadow blend modes blend the shadow with the layer content', () => {
    expect(dark(render(rect([shadow('INNER_SHADOW')], RED))(40, 22))).toBe(true);
    // Screen with black leaves the content unchanged.
    expect(render(rect([shadow('INNER_SHADOW', { blendMode: 'SCREEN' })], RED))(40, 22).r).toBeGreaterThan(240);
  });
});
