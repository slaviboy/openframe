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
import { snapEqualGaps } from './equal-gaps';

const r = (x: number, y: number, width = 50, height = 50) => ({ x, y, width, height });

describe('snapEqualGaps', () => {
  test('snaps between two row neighbors so both gaps match, with indicators', () => {
    const result = snapEqualGaps(r(102, 10), [r(0, 0), r(200, 5)], 5);
    expect(result.dx).toBe(-2);
    expect(result.dy).toBe(0);
    expect(result.gaps).toEqual([
      { axis: 'x', from: 50, to: 100, at: 35, distance: 50 },
      { axis: 'x', from: 150, to: 200, at: 35, distance: 50 },
    ]);
  });

  test('columns work the same way on the y axis', () => {
    const result = snapEqualGaps(r(0, 57, 40, 20), [r(0, 0, 40, 40), r(5, 100, 40, 40)], 5);
    // Space between the neighbors: 100 − 40 − 20 = 40, so the ideal top is 40 + 20 = 60.
    expect(result.dy).toBe(3);
    expect(result.gaps.map((g) => [g.axis, g.distance])).toEqual([
      ['y', 20],
      ['y', 20],
    ]);
  });

  test('no snap when out of threshold, when a neighbor is missing, or when the axis is disabled', () => {
    expect(snapEqualGaps(r(110, 0), [r(0, 0), r(200, 0)], 5)).toEqual({ dx: 0, dy: 0, gaps: [] });
    expect(snapEqualGaps(r(100, 0), [r(0, 0)], 5).gaps).toEqual([]);
    expect(snapEqualGaps(r(100, 0), [r(0, 200), r(200, 200)], 5).gaps).toEqual([]);
    expect(snapEqualGaps(r(102, 0), [r(0, 0), r(200, 0)], 5, { x: false, y: true }).dx).toBe(0);
  });
});
