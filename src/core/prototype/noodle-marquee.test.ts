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
import { noodleBetween, noodleCrossesRect } from './connections';

describe('selecting connections with a marquee', () => {
  // From a hotspot at 0–100 to a frame at 300–400 (both 0–100 high): the noodle runs straight along y 50, from x 100 to 300.
  const noodle = noodleBetween({ x: 0, y: 0, width: 100, height: 100 }, { x: 300, y: 0, width: 100, height: 100 });

  test('a marquee over the noodle, or across it, selects it; one beside it does not', () => {
    expect(noodleCrossesRect(noodle, { x: 190, y: 40, width: 20, height: 20 })).toBe(true);
    // Thinner than the steps the curve is followed in.
    expect(noodleCrossesRect(noodle, { x: 150.1, y: 0, width: 0.2, height: 100 })).toBe(true);
    expect(noodleCrossesRect(noodle, { x: 190, y: 0, width: 20, height: 5 })).toBe(false);
    expect(noodleCrossesRect(noodle, { x: 500, y: 40, width: 20, height: 20 })).toBe(false);
  });
});
