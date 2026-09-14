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
import { penClick, penStart, vertexAt } from './pen';

describe('pen', () => {
  test('clicks add connected points; closing on the first point makes a region and ends the path', () => {
    let pen = penStart();
    for (const p of [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ])
      pen = penClick(pen, p);
    pen = penClick(pen, { x: 0, y: 0 }, undefined, vertexAt(pen.network, { x: 1, y: 1 }, 3));
    expect(pen.network.vertices).toHaveLength(3);
    expect(pen.network.segments.map((s) => [s.start, s.end])).toEqual([
      [0, 1],
      [1, 2],
      [2, 0],
    ]);
    expect(pen.network.regions).toEqual([{ loops: [[0, 1, 2]], windingRule: 'NONZERO' }]);
    expect(pen.last).toBeNull();
  });

  test('dragging while placing a point curves the segments on both sides of it', () => {
    let pen = penClick(penStart(), { x: 0, y: 0 });
    pen = penClick(pen, { x: 20, y: 0 }, { x: 5, y: 5 });
    pen = penClick(pen, { x: 40, y: 0 });
    expect(pen.network.segments[0]).toMatchObject({ tangentStart: { x: 0, y: 0 }, tangentEnd: { x: -5, y: -5 } });
    expect(pen.network.segments[1]).toMatchObject({ tangentStart: { x: 5, y: 5 }, tangentEnd: { x: 0, y: 0 } });
  });

  test('joining a point of another path continues from it without closing', () => {
    let pen = penClick(penClick(penStart(), { x: 0, y: 0 }), { x: 10, y: 0 });
    const other = penClick(penStart(pen.network), { x: 5, y: 10 });
    const joined = penClick(other, { x: 10, y: 0 }, undefined, 1);
    expect(joined.network.segments.at(-1)).toMatchObject({ start: 2, end: 1 });
    expect(joined.network.regions).toEqual([]);
    expect(joined.last).toBe(1);
    // Clicking the point just placed does nothing.
    pen = penClick(joined, { x: 10, y: 0 }, undefined, 1);
    expect(pen).toBe(joined);
    expect(vertexAt(joined.network, { x: 50, y: 50 }, 4)).toBeNull();
  });
});
