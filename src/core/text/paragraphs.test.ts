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
import { fromParagraphOffset, lineBudgets, paragraphAt, paragraphRanges, toParagraphOffset } from './paragraphs';

describe('paragraphs', () => {
  test('line breaks split the text into paragraphs', () => {
    expect(paragraphRanges('one\ntwo')).toEqual([
      { index: 0, start: 0, end: 3, hasBreak: true },
      { index: 1, start: 4, end: 7, hasBreak: false },
    ]);
    expect(paragraphRanges('')).toEqual([{ index: 0, start: 0, end: 0, hasBreak: false }]);
    expect(paragraphRanges('a\n')).toEqual([
      { index: 0, start: 0, end: 1, hasBreak: true },
      { index: 1, start: 2, end: 2, hasBreak: false },
    ]);
    expect(paragraphRanges('\n\n').map((r) => [r.start, r.end])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
  });

  test('offsets map to the containing paragraph and back, across a prefix', () => {
    const ranges = paragraphRanges('one\ntwo');
    expect(paragraphAt(ranges, 3).index).toBe(0);
    expect(paragraphAt(ranges, 4).index).toBe(1);
    expect(paragraphAt(ranges, 99).index).toBe(1);
    const second = ranges[1]!;
    expect(toParagraphOffset(second, 5, 1)).toBe(2);
    expect(fromParagraphOffset(second, 2, 1)).toBe(5);
    // The placeholder itself maps to the paragraph start; past the end clamps to the end.
    expect(fromParagraphOffset(second, 0, 1)).toBe(4);
    expect(fromParagraphOffset(second, 50, 1)).toBe(7);
    expect(toParagraphOffset(second, 0, 0)).toBe(0);
  });

  test('max lines is shared across paragraphs in order', () => {
    expect(lineBudgets([2, 3, 1], undefined)).toEqual([2, 3, 1]);
    expect(lineBudgets([2, 3, 1], 4)).toEqual([2, 2, 0]);
    expect(lineBudgets([2, 3, 1], 10)).toEqual([2, 3, 1]);
    expect(lineBudgets([1], 0)).toEqual([0]);
  });
});
