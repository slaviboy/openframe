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

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, test } from 'vitest';
import { makeText } from '@/core/document/factory';
import type { TextNode } from '@/core/schema/document';
import { BUNDLED_FONT_FILES } from './font-files';
import { TextShaper } from './text-shaper';

const require = createRequire(import.meta.url);
let ck: CanvasKit;
let shaper: TextShaper;

beforeAll(async () => {
  const init = require('canvaskit-wasm/bin/full/canvaskit.js') as (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>;
  ck = await init({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });
  const fonts = BUNDLED_FONT_FILES.map(({ family, file, package: pkg }) => ({ family, bytes: new Uint8Array(readFileSync(require.resolve(`${pkg}/files/${file}`))) }));
  shaper = new TextShaper(ck, fonts);
});

const W = 260;
const H = 90;

/** Draws a text layer black with red underlines and counts red pixels. */
function redPixels(patch: Partial<TextNode>): number {
  const base = { ...makeText({ id: 'x:1', parent: { id: 'x:0', key: 'V' }, name: 'T', x: 0, y: 0, width: 0, height: 0 }), fontSize: 48, characters: 'gypsy', textDecoration: 'UNDERLINE' as const, ...patch };
  const node: TextNode = { ...base, size: shaper.measure(base, null) };
  const surface = ck.MakeSurface(W, H)!;
  const canvas = surface.getCanvas();
  canvas.clear(ck.WHITE);
  const glyph = new ck.Paint();
  glyph.setColor(ck.BLACK);
  const background = new ck.Paint();
  background.setColor(ck.TRANSPARENT);
  shaper.draw(canvas, node, { background, paint: () => glyph, decorationColor: () => ck.RED, decorations: patch.textDecoration === 'NONE' ? false : undefined });
  const pixels = surface.makeImageSnapshot().readPixels(0, 0, { width: W, height: H, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB })!;
  let red = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 160 && pixels[i + 1]! < 110 && pixels[i + 2]! < 110) red++;
  glyph.delete();
  background.delete();
  surface.delete();
  return red;
}

/** Draws a text layer at x = 40 and counts dark pixels left of the layer. */
function darkLeftOfBox(patch: Partial<TextNode>): number {
  const base = { ...makeText({ id: 'x:2', parent: { id: 'x:0', key: 'V' }, name: 'T', x: 0, y: 0, width: 0, height: 0 }), fontSize: 40, characters: `${String.fromCodePoint(0x201c)}Hi`, ...patch };
  const node: TextNode = { ...base, size: shaper.measure(base, null) };
  const surface = ck.MakeSurface(W, H)!;
  const canvas = surface.getCanvas();
  canvas.clear(ck.WHITE);
  canvas.translate(40, 0);
  const glyph = new ck.Paint();
  glyph.setColor(ck.BLACK);
  const background = new ck.Paint();
  background.setColor(ck.TRANSPARENT);
  shaper.draw(canvas, node, { background, paint: () => glyph });
  const pixels = surface.makeImageSnapshot().readPixels(0, 0, { width: W, height: H, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB })!;
  let dark = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < 39; x++) if (pixels[(y * W + x) * 4]! < 120) dark++;
  glyph.delete();
  background.delete();
  surface.delete();
  return dark;
}

describe('drawing hanging quotes', () => {
  test('the hanging quote is drawn left of the text box', () => {
    expect(darkLeftOfBox({})).toBe(0);
    expect(darkLeftOfBox({ hangingPunctuation: true })).toBeGreaterThan(10);
  });
});

describe('drawing underlines', () => {
  test('underlines paint in each style, skip ink erases around descenders, and a pass without decorations draws none', () => {
    const solid = redPixels({ decorationSkipInk: false });
    expect(solid).toBeGreaterThan(200);
    // Skip ink leaves gaps where g, y and p cross the underline.
    expect(redPixels({ decorationSkipInk: true })).toBeLessThan(solid * 0.9);
    const dotted = redPixels({ decorationSkipInk: false, decorationStyle: 'DOTTED' });
    expect(dotted).toBeGreaterThan(20);
    expect(dotted).toBeLessThan(solid);
    expect(redPixels({ decorationSkipInk: false, decorationStyle: 'WAVY' })).toBeGreaterThan(50);
    // Thicker underlines cover more.
    expect(redPixels({ decorationSkipInk: false, decorationThickness: 6 })).toBeGreaterThan(solid * 1.5);
    expect(redPixels({ textDecoration: 'NONE' })).toBe(0);
  });
});

describe('laid-out text kept between frames', () => {
  /** Draws `count` layers in one frame, as a page of them does, and reports how many blocks the shaper kept. */
  function frame(shaper: TextShaper, count: number): number {
    const surface = ck.MakeSurface(10, 10)!;
    const canvas = surface.getCanvas();
    const paint = new ck.Paint();
    const background = new ck.Paint();
    background.setColor(ck.TRANSPARENT);
    shaper.beginFrame();
    for (let i = 0; i < count; i++) {
      const base = { ...makeText({ id: `f:${i}`, parent: { id: 'f:0', key: 'V' }, name: 'T', x: 0, y: 0, width: 0, height: 0 }), fontSize: 12, characters: `Layer ${i}` };
      shaper.draw(canvas, { ...base, size: { width: 60, height: 16 } }, { background, paint: () => paint }, 'fill:0');
    }
    paint.delete();
    background.delete();
    surface.delete();
    return (shaper as unknown as { layouts: Map<string, unknown> }).layouts.size;
  }

  test('a frame keeps every layer it drew, however many that is, and lets go once they stop being drawn', () => {
    const own = new TextShaper(ck, []);
    // More layers than the cache holds when nothing is being drawn: dropping any of them would mean shaping it
    // again on the next frame, and every frame after that.
    const drawn = 400;
    expect(frame(own, drawn)).toBe(drawn);
    // Drawn again, the blocks are the ones the frame before laid out: nothing new is kept.
    expect(frame(own, drawn)).toBe(drawn);
    // Frames that draw none of them let them go.
    frame(own, 0);
    frame(own, 0);
    expect((own as unknown as { layouts: Map<string, unknown> }).layouts.size).toBe(0);
    own.dispose();
  });
});
