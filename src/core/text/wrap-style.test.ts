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
import { balancedWidth, prettyWidth } from './wrap-style';

/** Greedy line breaking of words 10 px per character with 10 px spaces: the lines at a width. */
function wrap(words: readonly string[], width: number): string[][] {
  const lines: string[][] = [];
  let line: string[] = [];
  let used = 0;
  for (const word of words) {
    const w = word.length * 10;
    const needed = line.length === 0 ? w : used + 10 + w;
    if (line.length > 0 && needed > width) {
      lines.push(line);
      line = [word];
      used = w;
    } else {
      line.push(word);
      used = needed;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

const lineWidth = (line: readonly string[]) => line.join(' ').length * 10;

describe('wrap styles', () => {
  test('balance narrows to the smallest width with the same number of lines', () => {
    const words = 'aaaa bbbb cccc dddd eeee'.split(' ');
    // At 200 px: "aaaa bbbb cccc dddd" (190) and "eeee" (40).
    expect(wrap(words, 200).map(lineWidth)).toEqual([190, 40]);
    const width = balancedWidth((w) => wrap(words, w).length, 200);
    const lines = wrap(words, width);
    expect(lines).toHaveLength(2);
    expect(lines.map(lineWidth)).toEqual([140, 90]);
    expect(balancedWidth((w) => wrap(words, w).length, 400)).toBe(400);
  });

  test('pretty moves a word onto an orphaned last line without adding lines', () => {
    const words = 'aa bb cc dd ee ff gg'.split(' ');
    const layout = (w: number) => {
      const lines = wrap(words, w);
      return { lines: lines.length, lastLineWords: lines[lines.length - 1]!.length };
    };
    // At 170 px the last line is the single word "gg".
    expect(layout(170)).toEqual({ lines: 2, lastLineWords: 1 });
    const width = prettyWidth(layout, 170, 40);
    expect(width).toBeLessThan(170);
    expect(layout(width)).toEqual({ lines: 2, lastLineWords: 2 });
    // Not an orphan, or no room to fix it within the limit: unchanged.
    expect(prettyWidth(layout, 400, 40)).toBe(400);
    // At 175 px the fix needs just over 5 px of narrowing (the first line is 170 px wide).
    expect(prettyWidth(layout, 175, 5)).toBe(175);
  });
});
