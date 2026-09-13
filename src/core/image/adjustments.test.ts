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
import { adjustColor, adjustmentValues, hasAdjustments } from './adjustments';

const orange: [number, number, number] = [0.8, 0.4, 0.2];

describe('image adjustments', () => {
  test('no adjustments leave colors unchanged', () => {
    const out = adjustColor(orange, {});
    out.forEach((v, i) => expect(v).toBeCloseTo(orange[i]!));
    expect(hasAdjustments(undefined)).toBe(false);
    expect(hasAdjustments({ exposure: 0 })).toBe(false);
    expect(hasAdjustments({ tint: -0.2 })).toBe(true);
    expect(adjustmentValues({ contrast: 0.5, shadows: -1 })).toEqual([0, 0.5, 0, 0, 0, 0, -1]);
  });

  test('saturation −100 is grayscale; contrast −100 is mid gray; exposure +100 doubles', () => {
    const [r, g, b] = adjustColor(orange, { saturation: -1 });
    expect(r).toBeCloseTo(g);
    expect(g).toBeCloseTo(b);
    adjustColor(orange, { contrast: -1 }).forEach((v) => expect(v).toBeCloseTo(0.5));
    expect(adjustColor([0.2, 0.3, 0.4], { exposure: 1 })).toEqual([0.4, 0.6, 0.8].map((v) => expect.closeTo(v, 9)));
  });

  test('temperature warms or cools, tint shifts green–magenta, results stay in range', () => {
    const warm = adjustColor([0.5, 0.5, 0.5], { temperature: 1 });
    expect(warm[0]).toBeGreaterThan(0.5);
    expect(warm[2]).toBeLessThan(0.5);
    const magenta = adjustColor([0.5, 0.5, 0.5], { tint: 1 });
    expect(magenta[1]).toBeLessThan(0.5);
    for (const v of adjustColor([1, 1, 1], { exposure: 1, highlights: 1 })) expect(v).toBe(1);
  });

  test('highlights affect light colors and shadows affect dark ones', () => {
    expect(adjustColor([0.9, 0.9, 0.9], { highlights: 1 })[0]).toBeGreaterThan(0.9);
    expect(adjustColor([0.1, 0.1, 0.1], { highlights: 1 })[0]).toBeCloseTo(0.1);
    expect(adjustColor([0.1, 0.1, 0.1], { shadows: 1 })[0]).toBeGreaterThan(0.1);
    expect(adjustColor([0.9, 0.9, 0.9], { shadows: 1 })[0]).toBeCloseTo(0.9);
  });
});
