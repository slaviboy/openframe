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
import { moveItem } from './move-item';

describe('moveItem', () => {
  test('moves forward and backward without mutating the input', () => {
    const list = ['a', 'b', 'c', 'd'];
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveItem(list, 1, 1)).toEqual(list);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });

  test('clamps out-of-range positions', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 9)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 7, -2)).toEqual(['c', 'a', 'b']);
    expect(moveItem([], 0, 1)).toEqual([]);
  });
});
