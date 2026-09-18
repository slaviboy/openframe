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
import { measureBetween, measureToOutline } from './measure';

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

describe('measuring to a layer that has been turned', () => {
  /** A square of 40 turned 45°, so its corners point up, down, left and right around (100, 0). */
  const diamond = [
    { x: 80, y: 0 },
    { x: 100, y: -20 },
    { x: 120, y: 0 },
    { x: 100, y: 20 },
  ];

  test('the distance reaches the edge the shape really has, not the box around it', () => {
    // A 20-wide selection ending at x = 20, level with the diamond's middle.
    const lines = measureToOutline({ x: 0, y: -10, width: 20, height: 20 }, diamond);
    const across = lines.find((line) => line.axis === 'x')!;
    // The box around the diamond starts at x = 80, but at this height its edge is the left corner, also 80.
    expect(across.distance).toBe(60);
    expect(across.from).toEqual({ x: 20, y: 0 });
  });

  test('level with a corner the shape is narrower, so the distance is longer than to its box', () => {
    // Overlapping only the diamond's top half, so the line is drawn where it has drawn in.
    const lines = measureToOutline({ x: 0, y: -20, width: 20, height: 20 }, diamond);
    const across = lines.find((line) => line.axis === 'x')!;
    expect(across.distance).toBeGreaterThan(60);
    expect(across.to.x).toBeGreaterThan(80);
  });

  test('a shape above the selection is measured downward to its lowest point at that width', () => {
    const lines = measureToOutline({ x: 90, y: 60, width: 20, height: 20 }, diamond);
    const down = lines.find((line) => line.axis === 'y')!;
    expect(down.from).toEqual({ x: 100, y: 20 });
    expect(down.distance).toBe(40);
  });

  test('a shape the selection already covers is not measured to', () => {
    expect(measureToOutline({ x: 70, y: -30, width: 60, height: 60 }, diamond)).toEqual([]);
  });
});
