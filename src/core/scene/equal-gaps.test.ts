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
import type { Rect } from '../math/rect';
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

describe('matching a gap used elsewhere', () => {
  /** Three boxes of 40 in a row with 20 between them: 0, 60 and 120. */
  const row: Rect[] = [
    { x: 0, y: 0, width: 40, height: 40 },
    { x: 60, y: 0, width: 40, height: 40 },
    { x: 120, y: 0, width: 40, height: 40 },
  ];

  test('a layer dropped past the end lands at the spacing the row already uses', () => {
    // Its left edge is at 183, three short of the 180 that would carry the 20 gap on.
    const result = snapEqualGaps({ x: 183, y: 0, width: 40, height: 40 }, row, 5);
    expect(result.dx).toBeCloseTo(-3, 6);
    expect(result.gaps).toEqual([{ axis: 'x', from: 160, to: 180, at: 20, distance: 20 }]);
  });

  test('it reaches back before the row as well', () => {
    const result = snapEqualGaps({ x: -63, y: 0, width: 40, height: 40 }, row, 5);
    expect(result.dx).toBeCloseTo(3, 6);
    expect(result.gaps[0]).toMatchObject({ distance: 20, to: 0 });
  });

  test('centring between two neighbours still wins over matching a gap', () => {
    // Between the first two boxes there is room for one of 20, centred at 70.
    const between: Rect[] = [
      { x: 0, y: 0, width: 40, height: 40 },
      { x: 100, y: 0, width: 40, height: 40 },
      { x: 200, y: 0, width: 40, height: 40 },
    ];
    const result = snapEqualGaps({ x: 58, y: 0, width: 20, height: 40 }, between, 5);
    expect(result.dx).toBeCloseTo(2, 6);
    expect(result.gaps).toHaveLength(2);
  });

  test('a row with no gaps of its own offers nothing to match', () => {
    const touching: Rect[] = [
      { x: 0, y: 0, width: 40, height: 40 },
      { x: 40, y: 0, width: 40, height: 40 },
    ];
    expect(snapEqualGaps({ x: 120, y: 0, width: 40, height: 40 }, touching, 5).dx).toBe(0);
  });

  test('a layer too far from the row is left where it is', () => {
    expect(snapEqualGaps({ x: 400, y: 0, width: 40, height: 40 }, row, 5).dx).toBe(0);
  });
});
