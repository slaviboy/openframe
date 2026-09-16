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
import { repeatMatrices, repeats } from './repeat';

const size = { width: 100, height: 100 };
const round = (v: number) => Math.round(v * 1000) / 1000;

describe('a repeat transform', () => {
  test('one copy is the original alone', () => {
    expect(repeats(undefined)).toBe(false);
    expect(repeats({ kind: 'LINEAR', count: 1, spacing: 20 })).toBe(false);
    expect(repeatMatrices({ kind: 'LINEAR', count: 1, spacing: 20 }, size)).toEqual([IDENTITY]);
  });

  test('a linear repeat steps along the group, in x or in y', () => {
    const across = repeatMatrices({ kind: 'LINEAR', count: 3, spacing: 25 }, size);
    expect(across).toHaveLength(3);
    expect(across.map((m) => [m.e, m.f])).toEqual([
      [0, 0],
      [25, 0],
      [50, 0],
    ]);

    const down = repeatMatrices({ kind: 'LINEAR', count: 2, spacing: 40, direction: 'VERTICAL' }, size);
    expect(down.map((m) => [m.e, m.f])).toEqual([
      [0, 0],
      [0, 40],
    ]);
  });

  test('a radial repeat shares the full circle between the copies, turning about the middle', () => {
    const quarters = repeatMatrices({ kind: 'RADIAL', count: 4, spacing: 0 }, size);
    expect(quarters).toHaveLength(4);
    // The second copy is a quarter turn: the top-left corner lands where the top-right was.
    const corner = apply(quarters[1]!, { x: 0, y: 0 });
    expect(round(corner.x)).toBe(100);
    expect(round(corner.y)).toBe(0);
    // The middle of the group holds still.
    const middle = apply(quarters[2]!, { x: 50, y: 50 });
    expect(round(middle.x)).toBe(50);
    expect(round(middle.y)).toBe(50);
  });

  test('a radial repeat over part of a circle ends on its last copy', () => {
    const fan = repeatMatrices({ kind: 'RADIAL', count: 3, spacing: 0, angle: 90 }, size);
    const last = apply(fan[2]!, { x: 50, y: 0 });
    // Half of the fan's 90° is 45° per step, so the last copy has turned the full 90°.
    expect(round(last.x)).toBe(100);
    expect(round(last.y)).toBe(50);
  });
});
