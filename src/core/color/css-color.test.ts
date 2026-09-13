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

import { describe, expect, test } from 'vitest';
import { colorEquals } from './color';
import { formatCssColor, parseCssColor } from './css-color';
import { formatColorFields, parseColorFields } from './format';

const orange = { r: 1, g: 128 / 255, b: 0, a: 1 };

describe('CSS colors', () => {
  test('parses hex, rgb, hsl, named and color() syntaxes', () => {
    const cases: [string, { r: number; g: number; b: number; a: number }][] = [
      ['#ff8000', orange],
      ['FF8000', orange],
      ['rgb(255, 128, 0)', orange],
      ['rgba(255,128,0,0.5)', { ...orange, a: 0.5 }],
      ['rgb(255 128 0 / 50%)', { ...orange, a: 0.5 }],
      ['rgb(100% 50.2% 0%)', orange],
      ['hsl(30.12, 100%, 50%)', orange],
      ['hsla(30.12deg 100% 50% / .25)', { ...orange, a: 0.25 }],
      ['orange', { r: 1, g: 165 / 255, b: 0, a: 1 }],
      ['RebeccaPurple', { r: 0x66 / 255, g: 0x33 / 255, b: 0x99 / 255, a: 1 }],
      ['transparent', { r: 0, g: 0, b: 0, a: 0 }],
      ['color(srgb 1 0.502 0)', orange],
    ];
    for (const [text, expected] of cases) {
      const parsed = parseCssColor(text);
      expect(parsed, text).not.toBeNull();
      expect(colorEquals(parsed!.color, expected), text).toBe(true);
      expect(parsed!.space).toBe('srgb');
    }
    expect(parseCssColor('color(display-p3 1 0 0 / 0.4)')).toEqual({ color: { r: 1, g: 0, b: 0, a: 0.4 }, space: 'display-p3' });
  });

  test('rejects malformed colors', () => {
    for (const text of ['', 'rgb(1, 2)', 'rgb(1 2 3 4 5)', 'hsl(x 1% 1%)', 'color(rec2020 1 0 0)', 'notacolor', 'rgb(1 2 3 /)', '#12345']) {
      expect(parseCssColor(text), text).toBeNull();
    }
  });

  test('formats with opacity per color profile and round-trips through the picker fields', () => {
    expect(formatCssColor(orange, 0.5, 'SRGB')).toBe('rgba(255, 128, 0, 0.5)');
    expect(formatCssColor({ r: 1, g: 0, b: 0, a: 1 }, 1, 'DISPLAY_P3')).toBe('color(display-p3 1 0 0 / 1)');
    expect(formatColorFields(orange, 'css', { opacity: 0.25 })).toEqual(['rgba(255, 128, 0, 0.25)']);
    const parsed = parseColorFields(['rgba(255, 128, 0, 0.25)'], 'css')!;
    expect(colorEquals(parsed, { ...orange, a: 0.25 })).toBe(true);
  });

  test('converts between sRGB and Display P3 files', () => {
    // An sRGB color typed into a P3 file is stored as its P3 equivalent (and back).
    const inP3 = parseColorFields(['#ff0000'], 'css', 'DISPLAY_P3')!;
    expect(inP3.r).toBeLessThan(1);
    expect(inP3.g).toBeGreaterThan(0);
    const inSrgb = parseColorFields(['color(display-p3 1 0 0)'], 'css', 'SRGB')!;
    // P3 red is outside sRGB and clips to pure red.
    expect(colorEquals(inSrgb, { r: 1, g: 0, b: 0, a: 1 })).toBe(true);
  });
});
