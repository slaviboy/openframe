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
import { SMART_SYMBOLS } from '@/core/text/smart-symbols';
import { BUNDLED_FONT_FILES, EMOJI_FAMILY, EMOJI_FONT_FILE, SYMBOL_FALLBACK_FILES, symbolFallbackFamily } from './font-files';
import { TextShaper } from './text-shaper';
import { loadCjkSubsets } from './cjk-fonts';

const require = createRequire(import.meta.url);
let shaper: TextShaper;
let canvasKit: CanvasKit;

/** The bundled fonts, read from the packages they ship in. */
const bundledFonts = () => BUNDLED_FONT_FILES.map(({ family, file, package: pkg }) => ({ family, bytes: new Uint8Array(readFileSync(require.resolve(`${pkg}/files/${file}`))) }));

beforeAll(async () => {
  const init = require('canvaskit-wasm/bin/full/canvaskit.js') as (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>;
  canvasKit = await init({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });
  shaper = new TextShaper(canvasKit, bundledFonts());
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

  test('OpenType features change shaping, and support is detected per font', () => {
    const digits = text({ characters: '1111' });
    expect(shaper.measure({ ...digits, openTypeFeatures: { tnum: true } }, null).width).toBeGreaterThan(shaper.measure(digits, null).width + 2);
    const supported = shaper.supportedFeatures({ family: 'Inter', style: 'Regular' });
    expect(supported).toEqual(expect.arrayContaining(['tnum', 'frac', 'calt', 'kern']));
    // The bundled Inter subset has no slashed zero or stylistic sets.
    expect(supported).not.toContain('zero');
    expect(supported).not.toContain('ss01');
    expect(shaper.supportedFeatures({ family: 'Inter', style: 'Regular' })).toBe(supported);
  });

  test('variable axis values change shaping, and the bundled font reports its weight axis', () => {
    const regular = shaper.measure(text({ characters: 'Hello' }), null).width;
    expect(shaper.measure(text({ characters: 'Hello', fontVariations: { wght: 900 } }), null).width).toBeGreaterThan(regular + 2);
    // A stored weight wins over the style name's.
    const bold = text({ characters: 'Hello', fontName: { family: 'Inter', style: 'Bold' } });
    expect(shaper.measure({ ...bold, fontVariations: { wght: 400 } }, null).width).toBeCloseTo(regular, 0);
    expect(shaper.fontAxes('Inter')).toEqual([{ tag: 'wght', name: 'Weight', min: 100, default: 400, max: 900, hidden: false }]);
    expect(shaper.fontAxes('Not A Font')).toEqual([]);
  });

  test('right-to-left paragraphs shape with the bundled Noto fallbacks and put the caret on the right', () => {
    expect(shaper.registeredFamilies).toEqual(expect.arrayContaining(['Inter (noto-arabic)', 'Inter (noto-hebrew)']));
    const hebrew = text({ characters: 'שלום' });
    const laid = { ...hebrew, size: shaper.measure(hebrew, null) };
    expect(laid.size.width).toBeGreaterThan(30);
    // The first character is at the right edge, the end of the text at the left.
    expect(shaper.caretAt(laid, 0).x).toBeCloseTo(laid.size.width, 0);
    expect(shaper.caretAt(laid, 4).x).toBeCloseTo(0, 0);
    expect(shaper.caretAt(laid, 1).x).toBeLessThan(shaper.caretAt(laid, 0).x);
    const arabic = shaper.measure(text({ characters: 'مرحبا' }), null);
    expect(arabic.width).toBeGreaterThan(30);
    // A right-to-left list item has its marker on the right.
    const item = text({ characters: 'שלום', listType: 'UNORDERED' });
    const itemLaid = { ...item, size: shaper.measure(item, null) };
    expect(shaper.caretAt(itemLaid, 0).x).toBeLessThan(itemLaid.size.width - 20);
  });

  test('emoji shape with the color emoji fallback once it is registered, flags and sequences included', () => {
    const emoji = text({ characters: '😀👍🏽🇺🇸' });
    const before = shaper.measure(emoji, null).width;
    shaper.registerFallbackFonts([{ family: EMOJI_FAMILY, bytes: new Uint8Array(readFileSync(require.resolve(`${EMOJI_FONT_FILE.package}/files/${EMOJI_FONT_FILE.file}`))) }]);
    expect(shaper.registeredFamilies).toContain(EMOJI_FAMILY);
    expect(shaper.availableFonts().map((f) => f.family)).not.toContain(EMOJI_FAMILY);
    const laid = { ...emoji, size: shaper.measure(emoji, null) };
    expect(laid.size.width).not.toBeCloseTo(before, 0);
    // Three glyph clusters: the skin tone and the flag letters join their sequences.
    expect(shaper.caretAt(laid, 2).x).toBeGreaterThan(10);
    expect(shaper.offsetAt(laid, { x: laid.size.width + 5, y: 5 })).toBe(emoji.characters.length);
  });

  test('icon fonts: private-use characters shape from an uploaded icon font', () => {
    const file = (name: string) => new Uint8Array(readFileSync(require.resolve(`@fortawesome/fontawesome-free/webfonts/${name}`)));
    const family = shaper.fontFamilyOf(file('fa-solid-900.woff2'))!;
    expect(family).toBe('Font Awesome 7 Free');
    shaper.registerFonts([
      { family, style: 'Black', bytes: file('fa-solid-900.woff2'), variable: false },
      { family, style: 'Regular', bytes: file('fa-regular-400.woff2'), variable: false },
    ]);
    expect(shaper.availableFonts().find((f) => f.family === family)?.styles).toEqual(['Regular', 'Black']);
    // U+F015 (house) and U+F004 (heart): each icon is one em wide in the icon font.
    const icons = text({ characters: String.fromCodePoint(0xf015, 0xf004), fontName: { family, style: 'Black' } });
    expect(shaper.measure(icons, null).width).toBeCloseTo(40, 0);
    expect(shaper.measure({ ...icons, fontName: { family, style: 'Regular' } }, null).width).toBeCloseTo(40, 0);
    const laid = { ...icons, size: shaper.measure(icons, null) };
    expect(shaper.caretAt(laid, 1).x).toBeCloseTo(20, 0);
  });

  test('wrap styles balance lines or avoid an orphan without adding lines; hanging lists put markers outside', () => {
    const lastLineWords = (node: TextNode) => {
      const [start, end] = shaper.lineRange(node, node.characters.length);
      return node.characters.slice(start, end).trim().split(/\s+/).length;
    };
    const rightmost = (node: TextNode) => Math.max(...shaper.selectionRects(node, 0, node.characters.length).map((r) => r.x + r.width));
    const base = text({ characters: 'one two three four five six seven eight nine ten eleven', textAutoResize: 'HEIGHT' });
    // Widths at which Auto leaves a single word on the last line: Pretty never adds a line, and fixes the orphan where it can.
    let orphans = 0;
    let fixed = 0;
    let width = 0;
    for (let w = 120; w < 400; w += 2) {
      const auto = { ...base, size: { width: w, height: shaper.measure(base, w).height } };
      if (auto.size.height <= 30 || lastLineWords(auto) !== 1) continue;
      orphans++;
      const pretty = { ...auto, wrapStyle: 'PRETTY' as const };
      expect(shaper.measure(pretty, w).height).toBeCloseTo(auto.size.height, 0);
      if (lastLineWords(pretty) >= 2) {
        fixed++;
        width ||= w;
      }
    }
    expect(orphans).toBeGreaterThan(0);
    expect(fixed).toBeGreaterThan(0);
    const auto = { ...base, size: { width, height: shaper.measure(base, width).height } };
    const balance = { ...auto, wrapStyle: 'BALANCE' as const };
    expect(shaper.measure(balance, width).height).toBeCloseTo(auto.size.height, 0);
    expect(rightmost(balance)).toBeLessThan(rightmost(auto) - 5);
    // Centered balanced text stays centered in the box.
    const centered = { ...balance, textAlignHorizontal: 'CENTER' as const };
    const rects = shaper.selectionRects(centered, 0, centered.characters.length);
    expect(Math.min(...rects.map((r) => r.x))).toBeGreaterThan(2);

    const item = text({ characters: 'item', listType: 'UNORDERED' });
    expect(shaper.caretAt({ ...item, size: shaper.measure(item, null) }, 0).x).toBeCloseTo(30, 0);
    const hanging = { ...item, hangingList: true };
    expect(shaper.caretAt({ ...hanging, size: shaper.measure(hanging, null) }, 0).x).toBeCloseTo(0, 0);
  });

  test('underlines: one piece per line, under the baseline by the font metrics, with thickness and offset', () => {
    const plain = text({ characters: 'gypsy' });
    expect(shaper.underlines({ ...plain, size: shaper.measure(plain, null) })).toEqual([]);
    const node = text({ characters: 'gypsy', textDecoration: 'UNDERLINE' });
    const laid = { ...node, size: shaper.measure(node, null) };
    const [piece] = shaper.underlines(laid);
    expect(piece).toBeDefined();
    // Inter's underline at 20 px: 1.37 px thick, 3.4 px below the baseline.
    expect(piece!.thickness).toBeCloseTo(4.375 / 64 * 20, 1);
    expect(piece!.x1).toBeCloseTo(0, 0);
    expect(piece!.x2).toBeCloseTo(laid.size.width, 0);
    const baseline = shaper.caretAt(laid, 0).bottom - 20 * 0.2;
    expect(piece!.y).toBeGreaterThan(baseline);
    const custom = shaper.underlines({ ...laid, decorationThickness: 3, decorationOffset: 4 })[0]!;
    expect(custom.thickness).toBe(3);
    expect(custom.y).toBeCloseTo(piece!.y + 4 + (3 - piece!.thickness) / 2, 1);
    // A wrapped run is underlined on each of its lines.
    const wrapped = text({ characters: 'underlined words across lines', textDecoration: 'UNDERLINE', textAutoResize: 'HEIGHT' });
    const wrappedLaid = { ...wrapped, size: { width: 90, height: shaper.measure(wrapped, 90).height } };
    expect(shaper.underlines(wrappedLaid).length).toBeGreaterThanOrEqual(2);
  });

  test('hanging quotes put an opening quote outside the box on the first line only', () => {
    const quote = String.fromCodePoint(0x201c);
    const base = text({ characters: `${quote}Quoted words that wrap onto another line`, textAutoResize: 'HEIGHT' });
    const laid = { ...base, size: { width: 140, height: shaper.measure(base, 140).height } };
    const quoteWidth = shaper.caretAt(laid, 1).x;
    expect(quoteWidth).toBeGreaterThan(3);
    const hanging = { ...laid, hangingPunctuation: true };
    // The quote starts left of the box; the first letter is at the edge.
    expect(shaper.caretAt(hanging, 0).x).toBeCloseTo(-quoteWidth, 0);
    expect(shaper.caretAt(hanging, 1).x).toBeCloseTo(0, 0);
    expect(shaper.selectionRects(hanging, 0, 1)[0]!.x).toBeCloseTo(-quoteWidth, 0);
    expect(shaper.offsetAt(hanging, { x: 1, y: 5 })).toBe(1);
    // The second line isn't shifted.
    const secondLine = shaper.offsetOnAdjacentLine(hanging, 1, 1, 0);
    expect(secondLine).toBeGreaterThan(1);
    expect(shaper.caretAt(hanging, secondLine).x).toBeCloseTo(0, 0);
    // Centered text and paragraphs without an opening quote don't hang.
    expect(shaper.caretAt({ ...hanging, textAlignHorizontal: 'CENTER' }, 0).x).toBeGreaterThan(0);
    expect(shaper.caretAt({ ...hanging, characters: 'Plain words' }, 0).x).toBeCloseTo(0, 0);
  });

  test('CJK text shapes with the Noto subsets its characters need, listed as pickable families', async () => {
    expect(shaper.availableFonts().map((f) => f.family)).toEqual(expect.arrayContaining(['Noto Sans SC', 'Noto Sans TC', 'Noto Sans JP', 'Noto Sans KR']));
    expect(shaper.fontAxes('Noto Sans JP')).toEqual([{ tag: 'wght', name: 'Weight', min: 100, default: 400, max: 900, hidden: false }]);
    const sample = 'こんにちは、世界。日本語';
    const node = text({ characters: sample });
    const before = shaper.measure(node, null).width;
    const fonts = await loadCjkSubsets('JP', sample, new Set());
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.length).toBeLessThan(20);
    shaper.registerCjkSubsets(fonts);
    expect(shaper.availableFonts().map((f) => f.family)).not.toContain(fonts[0]!.family);
    const after = shaper.measure(node, null).width;
    expect(after).not.toBeCloseTo(before, 0);
    // Each CJK character is about one em wide in Noto Sans JP.
    expect(after).toBeGreaterThan(sample.length * 20 * 0.8);
    // Requested subsets aren't loaded twice.
    const requested = new Set<string>();
    await loadCjkSubsets('JP', sample, requested);
    expect(await loadCjkSubsets('JP', sample, requested)).toEqual([]);
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

describe('text too small to read', () => {
  /** A label sized to its own text, which is what an auto-width layer is once the editor has fitted it. */
  const label = (patch: Partial<TextNode> = {}) => {
    const node = text({ characters: 'Balance', fontSize: 12, ...patch });
    return { ...node, size: shaper.measure(node, null) };
  };

  test('is shaped while a glyph is worth drawing, and stands in as bars below that', () => {
    // 12 px text: 3 device pixels to the em falls at a scale of 0.25.
    expect(shaper.greekedLines(label(), 0.25)).toBeNull();
    expect(shaper.greekedLines(label(), 1)).toBeNull();
    const bars = shaper.greekedLines(label(), 0.24);
    expect(bars).toHaveLength(1);
    // A layer of one line is its own box, so the bar is the line: as wide as the text, inside the box.
    const [bar] = bars!;
    expect(bar!.x).toBeCloseTo(0, 5);
    expect(bar!.width).toBeCloseTo(label().size.width, 5);
    expect(bar!.height).toBeGreaterThan(0);
    expect(bar!.y).toBeGreaterThanOrEqual(0);
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(label().size.height + 0.01);
    // A layer with nothing in it has nothing to stand in for, and is left to the text path, which draws nothing.
    expect(shaper.greekedLines(label({ characters: '' }), 0.01)).toBeNull();
  });

  test('gives a line per paragraph, the shorter ones shorter', () => {
    const node = label({ characters: 'Total balance\nEUR' });
    const bars = shaper.greekedLines({ ...node, size: shaper.measure(node, null) }, 0.02)!;
    expect(bars).toHaveLength(2);
    expect(bars[1]!.width).toBeLessThan(bars[0]!.width);
    expect(bars[1]!.y).toBeGreaterThan(bars[0]!.y);
  });

  test('wraps a fixed-width paragraph into as many bars as it has lines', () => {
    const characters = 'A garden grows best when the soil is kept loose and watered nightly.';
    const width = 120;
    const node = text({ characters, fontSize: 12, textAutoResize: 'HEIGHT', size: { width, height: 0 } });
    const laid = { ...node, size: shaper.measure(node, width) };
    // The height of one line, which the laid-out height divides into the number of lines the shaper made.
    const oneLine = shaper.measure(text({ characters: 'A', fontSize: 12 }), null).height;
    const shaped = Math.round(laid.size.height / oneLine);
    const bars = shaper.greekedLines(laid, 0.02)!;
    // The bars are worked out from the characters rather than shaped, so they land within a line of the real count.
    expect(Math.abs(bars.length - shaped)).toBeLessThanOrEqual(1);
    expect(bars.every((bar) => bar.width <= width + 0.01)).toBe(true);
    expect(bars.length).toBeGreaterThan(1);
  });

  test('follows the alignment of the layer and its line height', () => {
    // A fixed box wider than its text: the bar is the line, not the box.
    const centered = text({ characters: 'Balance', fontSize: 12, textAlignHorizontal: 'CENTER', textAutoResize: 'NONE', size: { width: 200, height: 40 } });
    const [bar] = shaper.greekedLines(centered, 0.02)!;
    expect(bar!.width).toBeGreaterThan(0);
    expect(bar!.width).toBeLessThan(200);
    expect(bar!.x).toBeCloseTo((200 - bar!.width) / 2, 5);
    const right = shaper.greekedLines({ ...centered, textAlignHorizontal: 'RIGHT' }, 0.02)!;
    expect(right[0]!.x + right[0]!.width).toBeCloseTo(200, 5);
    // A taller line height puts the second line further down.
    const tall = text({ characters: 'one\ntwo', fontSize: 12, lineHeight: { unit: 'PIXELS', value: 40 }, textAutoResize: 'NONE', size: { width: 200, height: 200 } });
    const lines = shaper.greekedLines(tall, 0.02)!;
    expect(lines[1]!.y - lines[0]!.y).toBeCloseTo(40, 5);
  });
});

/**
 * Arrows, maths and dingbats: the bundled Inter Latin subset carries ↑ and ↓ but not ← or →, and
 * nothing else registered covers them either, so they shaped as the missing-glyph box until the
 * symbol fallbacks were loaded for them. See docs/FONTS.md.
 */
describe('symbol fallbacks', () => {
  const SYMBOLS = '←→✓★▢≈∑♥';
  let symbols: TextShaper;

  beforeAll(() => {
    symbols = new TextShaper(canvasKit, bundledFonts());
  });

  test('reports the characters no registered font covers', () => {
    expect(symbols.uncoveredCodePoints(SYMBOLS)).toHaveLength([...SYMBOLS].length);
    // ↑, ™ and — are in Inter's own Latin subset, and Cyrillic is in a bundled fallback subset.
    expect(symbols.uncoveredCodePoints('Hello ↑™—')).toEqual([]);
    expect(symbols.uncoveredCodePoints('Привет')).toEqual([]);
    expect(symbols.uncoveredCodePoints('plain ASCII')).toEqual([]);
  });

  test('draws every symbol once its fallbacks are registered', () => {
    const before = symbols.measure(text({ characters: SYMBOLS }), null).width;
    symbols.registerSymbolFallbacks(
      SYMBOL_FALLBACK_FILES.map((file, index) => ({ family: symbolFallbackFamily(index), bytes: new Uint8Array(readFileSync(new URL(`../../../public/fonts/google/${file}`, import.meta.url))) })),
    );
    expect(symbols.uncoveredCodePoints(SYMBOLS)).toEqual([]);
    // The boxes were all one width; real glyphs are not, so the line measures differently.
    expect(symbols.measure(text({ characters: SYMBOLS }), null).width).not.toBeCloseTo(before, 1);
  });

  test('covers the symbols the editor itself types', () => {
    // Smart quotes/symbols turns -> into an arrow and [ ] into a ballot box: both must have a glyph.
    for (const [, symbol] of SMART_SYMBOLS) expect(symbols.uncoveredCodePoints(symbol)).toEqual([]);
  });
});
