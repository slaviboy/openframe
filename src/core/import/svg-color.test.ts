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
import { parseSvgColor, parseSvgPaint } from './svg-color';

describe('SVG colors and paints', () => {
  test('hex colors in 3, 4, 6 and 8 digits', () => {
    expect(parseSvgColor('#f00')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseSvgColor('#0F08')).toEqual({ r: 0, g: 1, b: 0, a: 0x88 / 255 });
    expect(parseSvgColor('#0000ff')).toEqual({ r: 0, g: 0, b: 1, a: 1 });
    expect(parseSvgColor('#ff000080')!.a).toBeCloseTo(128 / 255);
    expect(parseSvgColor('#12345')).toBeNull();
    expect(parseSvgColor('#ggg')).toBeNull();
  });

  test('rgb() and rgba(), with numbers, percentages and the slash alpha form', () => {
    expect(parseSvgColor('rgb(255, 0, 0)')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseSvgColor('rgba(0,0,255,0.5)')).toEqual({ r: 0, g: 0, b: 1, a: 0.5 });
    expect(parseSvgColor('rgb(100%, 50%, 0%)')).toEqual({ r: 1, g: 0.5, b: 0, a: 1 });
    expect(parseSvgColor('rgb(0 255 0 / 25%)')).toEqual({ r: 0, g: 1, b: 0, a: 0.25 });
    expect(parseSvgColor('rgb(300, -5, 0)')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseSvgColor('rgb(1, 2)')).toBeNull();
  });

  test('hsl() and hsla(), named colors and transparent', () => {
    const green = parseSvgColor('hsl(120, 100%, 50%)')!;
    expect(green.r).toBeCloseTo(0);
    expect(green.g).toBeCloseTo(1);
    expect(green.b).toBeCloseTo(0);
    expect(parseSvgColor('hsla(0deg 100% 50% / 0.5)')!.a).toBe(0.5);
    expect(parseSvgColor('hsl(0, 100, 50)')).toBeNull();
    expect(parseSvgColor('RebeccaPurple')).toEqual({ r: 0x66 / 255, g: 0x33 / 255, b: 0x99 / 255, a: 1 });
    expect(parseSvgColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseSvgColor('bogus')).toBeNull();
  });

  test('paints: none, currentColor, url() references and colors', () => {
    expect(parseSvgPaint(' none ')).toEqual({ kind: 'none' });
    expect(parseSvgPaint('currentColor')).toEqual({ kind: 'currentColor' });
    expect(parseSvgPaint('url(#grad)')).toEqual({ kind: 'reference', id: 'grad' });
    expect(parseSvgPaint("url('#fade') red")).toEqual({ kind: 'reference', id: 'fade' });
    expect(parseSvgPaint('white')).toEqual({ kind: 'color', color: { r: 1, g: 1, b: 1, a: 1 } });
    expect(parseSvgPaint('nope')).toBeNull();
  });
});
