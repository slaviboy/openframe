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

import type { WrapStyle } from '../schema/document';

export type { WrapStyle };

/** Search precision, in pixels. */
const PRECISION = 0.5;
const STEPS = 20;

/**
 * Balance: the narrowest width at which a paragraph keeps the number of lines it has at `full`, so
 * its lines come out as even as possible. `full` for text on one line.
 */
export function balancedWidth(lineCount: (width: number) => number, full: number): number {
  const target = lineCount(full);
  if (target < 2) return full;
  // Narrower than full / lines always needs another line.
  let tooNarrow = full / target;
  let fits = full;
  for (let i = 0; i < STEPS && fits - tooNarrow > PRECISION; i++) {
    const mid = (tooNarrow + fits) / 2;
    if (lineCount(mid) <= target) fits = mid;
    else tooNarrow = mid;
  }
  return fits;
}

/**
 * Pretty: when the last line holds a single word (an orphan), the widest width below `full` at which
 * a second word moves down without adding a line, narrowing by at most `maxShrink`. `full` when the
 * last line isn't an orphan or no such width exists.
 */
export function prettyWidth(layout: (width: number) => { readonly lines: number; readonly lastLineWords: number }, full: number, maxShrink: number): number {
  const atFull = layout(full);
  if (atFull.lines < 2 || atFull.lastLineWords !== 1) return full;
  const ok = (width: number) => {
    const result = layout(width);
    return result.lines === atFull.lines && result.lastLineWords >= 2;
  };
  let good = Math.max(1, full - maxShrink);
  if (!ok(good)) return full;
  let orphan = full;
  for (let i = 0; i < STEPS && orphan - good > PRECISION; i++) {
    const mid = (good + orphan) / 2;
    if (ok(mid)) good = mid;
    else orphan = mid;
  }
  return good;
}
