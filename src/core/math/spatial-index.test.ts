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
import { intersects, type Rect } from './rect';
import { SpatialIndex } from './spatial-index';

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('SpatialIndex', () => {
  test('empty index returns nothing', () => {
    expect(new SpatialIndex<number>().build().search({ x: 0, y: 0, width: 10, height: 10 })).toEqual([]);
  });

  test('matches brute force on 10k random rects', () => {
    const rand = seeded(42);
    const rects: Rect[] = Array.from({ length: 10_000 }, () => ({
      x: rand() * 10_000,
      y: rand() * 10_000,
      width: rand() * 200,
      height: rand() * 200,
    }));
    const index = new SpatialIndex<number>();
    rects.forEach((r, i) => index.add(i, r));
    index.build();

    for (let q = 0; q < 50; q++) {
      const query = { x: rand() * 9_000, y: rand() * 9_000, width: rand() * 1_000, height: rand() * 1_000 };
      const expected = rects.flatMap((r, i) => (intersects(r, query) ? [i] : [])).sort((a, b) => a - b);
      expect(index.search(query).sort((a, b) => a - b)).toEqual(expected);
    }
  });

  test('filter excludes items', () => {
    const index = new SpatialIndex<string>();
    index.add('a', { x: 0, y: 0, width: 5, height: 5 });
    index.add('b', { x: 1, y: 1, width: 5, height: 5 });
    index.build();
    expect(index.search({ x: 0, y: 0, width: 10, height: 10 }, (i) => i !== 'a')).toEqual(['b']);
  });
});
