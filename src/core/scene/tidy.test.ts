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
import { DEFAULT_TIDY_GAP, tidyLayout } from './tidy';

const r = (x: number, y: number, width = 50, height = 50) => ({ x, y, width, height });

describe('tidyLayout', () => {
  test('a messy row becomes evenly spaced with the median gap, aligned to the top', () => {
    // Gaps: 10, 30, 20 → median 20.
    const out = tidyLayout([r(0, 0), r(60, 8), r(140, -4), r(210, 3)]);
    expect(out).toEqual([
      { x: 0, y: -4 },
      { x: 70, y: -4 },
      { x: 140, y: -4 },
      { x: 210, y: -4 },
    ]);
  });

  test('a scattered selection becomes a grid in reading order with uniform gaps', () => {
    // Second row: centers 95 and 102 both fall within that row's bottom edge (110).
    const input = [r(0, 0), r(75, 5), r(3, 80, 50, 30), r(70, 82, 60, 40)];
    const out = tidyLayout(input);
    // Row gap: 80 - 55 = 25; column gaps 75 - 50 = 25 and 70 - 53 = 17 → median 21.
    // Rows are 50 tall, so the second row starts at 0 + 50 + 25.
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 71, y: 0 },
      { x: 0, y: 75 },
      { x: 71, y: 75 },
    ]);
    // A fourth item lower down starts a third row, after the 30px-tall second row: 75 + 30 + 25.
    expect(tidyLayout([r(0, 0), r(75, 5), r(3, 80, 50, 30), r(70, 95, 60, 40)])[3]).toEqual({ x: 0, y: 130 });
  });

  test('overlapping items use the default gap and keep input order in the output', () => {
    const out = tidyLayout([r(20, 0), r(0, 0)]);
    expect(out[1]).toEqual({ x: 0, y: 0 });
    expect(out[0]).toEqual({ x: 50 + DEFAULT_TIDY_GAP, y: 0 });
    expect(tidyLayout([])).toEqual([]);
  });
});
