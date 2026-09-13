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
import { clampLevel, listCounters, listMarker, listTrigger, toAlphabetic, toRoman, type ListItem } from './lists';

const bullet = (level = 1): ListItem => ({ type: 'UNORDERED', level });
const number = (level = 1): ListItem => ({ type: 'ORDERED', level });
const plain: ListItem = { type: 'NONE', level: 1 };

describe('lists', () => {
  test('letters and roman numerals', () => {
    expect([1, 2, 26, 27, 52, 703].map(toAlphabetic)).toEqual(['a', 'b', 'z', 'aa', 'az', 'aaa']);
    expect([1, 4, 9, 14, 40, 90, 400, 2026].map(toRoman)).toEqual(['i', 'iv', 'ix', 'xiv', 'xl', 'xc', 'cd', 'mmxxvi']);
    expect(toRoman(4000)).toBe('4000');
  });

  test('markers: the same bullet at every level; numbers, letters and roman numerals by level', () => {
    expect(listMarker(bullet(3), 0)).toBe('•');
    expect(listMarker(number(1), 3)).toBe('3.');
    expect(listMarker(number(2), 3)).toBe('c.');
    expect(listMarker(number(3), 3)).toBe('iii.');
    expect(listMarker(number(4), 3)).toBe('3.');
    expect(listMarker(plain, 1)).toBe('');
    expect(clampLevel(9)).toBe(5);
    expect(clampLevel(0)).toBe(1);
  });

  test('counters count per level, resume after deeper items and restart after other paragraphs', () => {
    expect(listCounters([number(), number(), number(2), number(2), number(), plain, number()])).toEqual([1, 2, 1, 2, 3, 0, 1]);
    // Returning to a shallower level ends the deeper count.
    expect(listCounters([number(), number(2), number(), number(2)])).toEqual([1, 1, 2, 1]);
    // A bullet at the same level restarts the numbering there.
    expect(listCounters([number(), bullet(), number()])).toEqual([1, 0, 1]);
  });

  test('typing a list start at the beginning of a paragraph', () => {
    expect(listTrigger('- ')).toEqual({ type: 'UNORDERED', length: 2 });
    expect(listTrigger('* ')).toEqual({ type: 'UNORDERED', length: 2 });
    expect(listTrigger('1. ')).toEqual({ type: 'ORDERED', length: 3 });
    expect(listTrigger('1) ')).toEqual({ type: 'ORDERED', length: 3 });
    expect(listTrigger('2. ')).toBeNull();
    expect(listTrigger('a - ')).toBeNull();
  });
});
