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
import { pencilNetwork, simplifyPolyline, smoothPath } from './pencil';

describe('pencil', () => {
  test('simplification drops points within the tolerance and keeps corners', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 5, y: 0.2 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(simplifyPolyline(line, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  test('smoothing uses Catmull–Rom tangents; two points stay straight', () => {
    const smooth = smoothPath([
      { x: 0, y: 0 },
      { x: 6, y: 6 },
      { x: 12, y: 0 },
    ]);
    expect(smooth.segments).toEqual([
      { start: 0, end: 1, tangentStart: { x: 1, y: 1 }, tangentEnd: { x: -2, y: 0 } },
      { start: 1, end: 2, tangentStart: { x: 2, y: 0 }, tangentEnd: { x: -1, y: 1 } },
    ]);
    expect(smoothPath([{ x: 0, y: 0 }, { x: 5, y: 5 }]).segments).toEqual([{ start: 0, end: 1, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } }]);
  });

  test('Shift draws a straight line from the first point to the last', () => {
    const drawn = [
      { x: 0, y: 0 },
      { x: 4, y: 9 },
      { x: 20, y: 3 },
    ];
    expect(pencilNetwork(drawn, { straight: true }).vertices).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 3 },
    ]);
    expect(pencilNetwork([]).vertices).toEqual([]);
  });
});
