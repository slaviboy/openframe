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
import { apply, IDENTITY } from '../math/matrix';
import { parseSvgTransform } from './svg-transform';

const at = (text: string, x: number, y: number) => apply(parseSvgTransform(text), { x, y });

describe('SVG transforms', () => {
  test('each function, with optional arguments', () => {
    expect(parseSvgTransform('matrix(1 2 3 4 5 6)')).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 });
    expect(at('translate(10)', 1, 1)).toEqual({ x: 11, y: 1 });
    expect(at('translate(10, 20)', 1, 1)).toEqual({ x: 11, y: 21 });
    expect(at('scale(2)', 3, 4)).toEqual({ x: 6, y: 8 });
    expect(at('scale(2 3)', 3, 4)).toEqual({ x: 6, y: 12 });
    const rotated = at('rotate(90)', 1, 0);
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(1);
    // Rotating about a center keeps the center in place.
    const center = at('rotate(45 10 10)', 10, 10);
    expect(center.x).toBeCloseTo(10);
    expect(center.y).toBeCloseTo(10);
    expect(at('skewX(45)', 0, 1).x).toBeCloseTo(1);
    expect(at('skewY(45)', 1, 0).y).toBeCloseTo(1);
  });

  test('a list applies right to left', () => {
    // Scale first, then translate.
    expect(at('translate(10 0) scale(2)', 1, 1)).toEqual({ x: 12, y: 2 });
    expect(at('scale(2),translate(10 0)', 1, 1)).toEqual({ x: 22, y: 2 });
  });

  test('an invalid list is ignored', () => {
    expect(parseSvgTransform(undefined)).toEqual(IDENTITY);
    expect(parseSvgTransform('')).toEqual(IDENTITY);
    expect(parseSvgTransform('translate(10) bogus(1)')).toEqual(IDENTITY);
    expect(parseSvgTransform('scale(1 2 3)')).toEqual(IDENTITY);
    expect(parseSvgTransform('rotate(a)')).toEqual(IDENTITY);
  });
});
