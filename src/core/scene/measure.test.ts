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
import { measureBetween } from './measure';

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('measureBetween', () => {
  test('horizontal gap through the middle of the vertical overlap', () => {
    expect(measureBetween(r(0, 0, 50, 50), r(80, 20, 40, 60))).toEqual([{ from: { x: 50, y: 35 }, to: { x: 80, y: 35 }, distance: 30, axis: 'x' }]);
    // Order doesn't matter: the selection on the right measures back to the left layer.
    expect(measureBetween(r(80, 20, 40, 60), r(0, 0, 50, 50))[0]!.distance).toBe(30);
  });

  test('diagonal neighbors get both gaps', () => {
    const lines = measureBetween(r(0, 0, 10, 10), r(30, 25, 10, 10));
    expect(lines.map((l) => [l.axis, l.distance])).toEqual([
      ['x', 20],
      ['y', 15],
    ]);
  });

  test('a layer inside another measures to all four edges, omitting zero distances', () => {
    const lines = measureBetween(r(10, 0, 30, 20), r(0, 0, 100, 50));
    expect(lines.map((l) => [l.axis, l.distance])).toEqual([
      ['x', 10],
      ['x', 60],
      ['y', 30],
    ]);
    expect(lines[0]).toMatchObject({ from: { x: 0, y: 10 }, to: { x: 10, y: 10 } });
  });

  test('overlapping layers have no gap to show', () => {
    expect(measureBetween(r(0, 0, 50, 50), r(40, 40, 50, 50))).toEqual([]);
  });
});
