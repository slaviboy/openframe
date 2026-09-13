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
let shaper: TextShaper;

beforeAll(async () => {
  const init = require('canvaskit-wasm/bin/full/canvaskit.js') as (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>;
  const ck = await init({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });
  const fonts = BUNDLED_FONT_FILES.map(({ family, file }) => ({ family, bytes: new Uint8Array(readFileSync(require.resolve(`@fontsource-variable/inter/files/${file}`))) }));
  shaper = new TextShaper(ck, fonts);
});

let serial = 0;
const text = (patch: Partial<TextNode> = {}): TextNode => ({
  ...makeText({ id: `x:${++serial}`, parent: { id: 'x:0', key: 'V' }, name: 'T', x: 0, y: 0, width: 0, height: 0 }),
  fontSize: 20,
  ...patch,
});

describe('text shaping', () => {
  test('measures natural and wrapped sizes that follow the font properties', () => {
    const hello = shaper.measure(text({ characters: 'Hello' }), null);
    const helloWorld = shaper.measure(text({ characters: 'Hello world' }), null);
    expect(hello.width).toBeGreaterThan(30);
    expect(helloWorld.width).toBeGreaterThan(hello.width);
    expect(hello.height).toBeGreaterThan(20);
    // Empty text keeps one line's height.
    expect(shaper.measure(text(), null).height).toBeCloseTo(hello.height, 0);
    // Wrapping to a narrow width adds lines; line breaks add lines at natural width.
    expect(shaper.measure(text({ characters: 'Hello world' }), hello.width + 2).height).toBeGreaterThan(hello.height * 1.5);
    expect(shaper.measure(text({ characters: 'a\nb\nc' }), null).height).toBeGreaterThan(hello.height * 2.5);
    // Bold, larger size and letter spacing are wider; a fixed line height sets the height.
    expect(shaper.measure(text({ characters: 'Hello', fontName: { family: 'Inter', style: 'Bold' } }), null).width).toBeGreaterThan(hello.width);
    expect(shaper.measure(text({ characters: 'Hello', letterSpacing: { unit: 'PERCENT', value: 20 } }), null).width).toBeGreaterThan(hello.width + 10);
    expect(shaper.measure(text({ characters: 'a\nb', lineHeight: { unit: 'PIXELS', value: 40 } }), null).height).toBeCloseTo(80, 0);
    // Characters outside Latin come from the fallback subsets (Cyrillic here), not a missing glyph box.
    expect(shaper.measure(text({ characters: 'Привет' }), null).width).toBeGreaterThan(40);
  });

  test('paragraph spacing stacks paragraphs apart and the indent offsets first lines', () => {
    const two = text({ characters: 'one\ntwo' });
    const plain = shaper.measure(two, null);
    const spaced = shaper.measure({ ...two, paragraphSpacing: 20 }, null);
    expect(spaced.height).toBeCloseTo(plain.height + 20, 0);
    const indentedSize = shaper.measure({ ...two, paragraphIndent: 30 }, null);
    expect(indentedSize.width).toBeCloseTo(plain.width + 30, 0);
    const indented = { ...two, paragraphIndent: 30, size: indentedSize };
    expect(shaper.caretAt(indented, 0).x).toBeCloseTo(30, 0);
    expect(shaper.caretAt(indented, 4).x).toBeCloseTo(30, 0);
    expect(shaper.lineRange(indented, 5)).toEqual([4, 7]);
    // Centered text isn't indented.
    expect(shaper.measure({ ...two, paragraphIndent: 30, textAlignHorizontal: 'CENTER' }, null).width).toBeCloseTo(plain.width, 0);

    const laid = { ...two, paragraphSpacing: 20, size: spaced };
    const first = shaper.caretAt(laid, 0);
    const second = shaper.caretAt(laid, 4);
    expect(second.top).toBeGreaterThan(first.bottom + 15);
    expect(shaper.offsetAt(laid, { x: 1, y: second.top + 2 })).toBe(4);
    expect(shaper.offsetOnAdjacentLine(laid, 1, 1, first.x)).toBe(4);
    expect(shaper.selectionRects(laid, 0, 7)).toHaveLength(2);
    // Max lines is shared across paragraphs.
    const three = text({ characters: 'a\nb\nc' });
    expect(shaper.measure({ ...three, maxLines: 2 }, null).height).toBeLessThan(shaper.measure(three, null).height * 0.8);
  });

  test('list items indent by level with hanging wrapped lines, and list spacing separates items', () => {
    const node = text({ characters: 'one two three four five six\nnext', listType: 'UNORDERED', textAutoResize: 'HEIGHT', size: { width: 140, height: 0 } });
    const sized = { ...node, size: { width: 140, height: shaper.measure(node, 140).height } };
    expect(shaper.caretAt(sized, 0).x).toBeCloseTo(30, 0);
    // A wrapped line starts where the first one does.
    const down = shaper.offsetOnAdjacentLine(sized, 0, 1, 0);
    expect(down).toBeGreaterThan(0);
    expect(down).toBeLessThan(27);
    expect(shaper.caretAt(sized, down).x).toBeCloseTo(30, 0);
    // Deeper levels indent further; text that isn't a list isn't indented.
    expect(shaper.caretAt({ ...sized, indentation: 2 }, 0).x).toBeCloseTo(60, 0);
    expect(shaper.caretAt({ ...sized, listType: 'NONE' }, 0).x).toBeCloseTo(0, 0);
    expect(shaper.offsetAt(sized, { x: 31, y: 5 })).toBe(0);
    // Auto width includes the indentation; list spacing adds space between items.
    const plain = shaper.measure(text({ characters: 'one' }), null).width;
    expect(shaper.measure(text({ characters: 'one', listType: 'ORDERED' }), null).width).toBeCloseTo(plain + 30, 0);
    const items = text({ characters: 'a\nb', listType: 'UNORDERED' });
    expect(shaper.measure({ ...items, listSpacing: 10 }, null).height).toBeCloseTo(shaper.measure(items, null).height + 10, 0);
  });

  test('letter case changes the shaped text and max lines limits the height', () => {
    const lower = shaper.measure(text({ characters: 'hello' }), null).width;
    expect(shaper.measure(text({ characters: 'hello', textCase: 'UPPER' }), null).width).toBeGreaterThan(lower);
    const long = text({ characters: 'one two three four five six seven eight', textAutoResize: 'HEIGHT' });
    const full = shaper.measure(long, 60).height;
    expect(shaper.measure({ ...long, maxLines: 1 }, 60).height).toBeLessThan(full / 2);
  });

  test('carets, hit testing and selection follow the laid-out glyphs', () => {
    const node = text({ characters: 'Hello world' });
    const size = shaper.measure(node, null);
    const laid = { ...node, size };
    const c0 = shaper.caretAt(laid, 0);
    const c5 = shaper.caretAt(laid, 5);
    const c11 = shaper.caretAt(laid, 11);
    expect(c0.x).toBeCloseTo(0, 0);
    expect(c5.x).toBeGreaterThan(c0.x);
    expect(c11.x).toBeCloseTo(size.width, 0);
    expect(c5.bottom - c5.top).toBeGreaterThan(15);
    expect(shaper.offsetAt(laid, { x: c5.x + 1, y: 10 })).toBe(5);
    expect(shaper.offsetAt(laid, { x: -50, y: 10 })).toBe(0);
    expect(shaper.offsetAt(laid, { x: 5000, y: 10 })).toBe(11);
    const rects = shaper.selectionRects(laid, 0, 5);
    expect(rects).toHaveLength(1);
    expect(rects[0]!.width).toBeCloseTo(c5.x, 0);
  });

  test('line navigation, empty lines and vertical alignment of fixed boxes', () => {
    const node = text({ characters: 'one\n\nthree' });
    const laid = { ...node, size: shaper.measure(node, null) };
    const line2 = shaper.caretAt(laid, 4);
    const line3 = shaper.caretAt(laid, 5);
    expect(line2.x).toBeCloseTo(0, 0);
    expect(line3.top).toBeGreaterThan(line2.top);
    expect(shaper.offsetOnAdjacentLine(laid, 1, 1, shaper.caretAt(laid, 1).x)).toBe(4);
    expect(shaper.offsetOnAdjacentLine(laid, 4, 1, 0)).toBe(5);
    expect(shaper.offsetOnAdjacentLine(laid, 1, -1, 0)).toBe(0);
    expect(shaper.offsetOnAdjacentLine(laid, 7, 1, 0)).toBe(10);
    expect(shaper.lineRange(laid, 2)).toEqual([0, 3]);
    expect(shaper.lineRange(laid, 7)).toEqual([5, 10]);

    const fixed = text({ characters: 'Hi', textAutoResize: 'NONE', size: { width: 100, height: 200 }, textAlignVertical: 'BOTTOM' });
    expect(shaper.caretAt(fixed, 0).bottom).toBeCloseTo(200, -1);
    const centered = text({ characters: '', textAlignHorizontal: 'CENTER', textAutoResize: 'NONE', size: { width: 100, height: 40 } });
    expect(shaper.caretAt(centered, 0).x).toBeCloseTo(50, 0);
  });
});
