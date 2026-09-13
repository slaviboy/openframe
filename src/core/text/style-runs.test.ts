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
import { makeText, solid } from '../document/factory';
import type { TextNode } from '../schema/document';
import { clearRunKeys, rangeValues, runsAfterEdit, styleRange, textChange, textSegments, textStyleAt, type TextStyleRun } from './style-runs';

const bold = { family: 'Inter', style: 'Bold' };
const red = [solid({ r: 1, g: 0, b: 0, a: 1 })];
const node = (characters: string, styleRuns?: TextStyleRun[]): TextNode => ({
  ...makeText({ id: 'x:1', parent: { id: 'x:0', key: 'V' }, name: 'T', x: 0, y: 0, width: 0, height: 0 }),
  characters,
  ...(styleRuns ? { styleRuns: styleRuns as NonNullable<TextNode['styleRuns']> } : {}),
});

describe('style runs', () => {
  test('styling a range splits, merges and normalizes runs', () => {
    const text = node('Hello world');
    const runs = styleRange(text, 6, 11, { fontName: bold });
    expect(runs).toEqual([{ start: 6, end: 11, style: { fontName: bold } }]);
    // Adjacent ranges with the same overrides merge; a different key splits.
    const merged = styleRange(node('Hello world', runs), 0, 6, { fontName: bold });
    expect(merged).toEqual([{ start: 0, end: 11, style: { fontName: bold } }]);
    const sized = styleRange(node('Hello world', runs), 8, 11, { fontSize: 20 });
    expect(sized).toEqual([
      { start: 6, end: 8, style: { fontName: bold } },
      { start: 8, end: 11, style: { fontName: bold, fontSize: 20 } },
    ]);
    // Styling back to the default removes the run entirely.
    expect(styleRange(node('Hello world', runs), 0, 11, { fontName: text.fontName })).toBeUndefined();
    // An empty range changes nothing.
    expect(styleRange(text, 3, 3, { fontSize: 40 })).toBeUndefined();
  });

  test('segments resolve full styles, and values are read over ranges', () => {
    const text = node('abcdef', [{ start: 2, end: 4, style: { fontSize: 30, fills: red } }]);
    expect(textSegments(text).map((s) => [s.start, s.end, s.fontSize])).toEqual([
      [0, 2, 12],
      [2, 4, 30],
      [4, 6, 12],
    ]);
    expect(textStyleAt(text, 3).fills).toEqual(red);
    expect(rangeValues(text, 0, 6, 'fontSize')).toEqual([12, 30]);
    expect(rangeValues(text, 2, 4, 'fontSize')).toEqual([30]);
    // At a caret, the style of the character before it.
    expect(rangeValues(text, 4, 4, 'fontSize')).toEqual([30]);
    expect(textSegments(node(''))).toHaveLength(1);
  });

  test('edits shift runs; typed text takes the style before the caret', () => {
    const text = node('Hello world', [{ start: 6, end: 11, style: { fontName: bold } }]);
    // Typing at the end of the bold word continues bold.
    expect(runsAfterEdit(text, 11, 11, 1)).toEqual([{ start: 6, end: 12, style: { fontName: bold } }]);
    // Typing before the bold word (after the space) stays regular and pushes the run.
    expect(runsAfterEdit(text, 5, 5, 3)).toEqual([{ start: 9, end: 14, style: { fontName: bold } }]);
    // Deleting across the boundary shrinks the run; deleting all of it removes it.
    expect(runsAfterEdit(text, 4, 8, 0)).toEqual([{ start: 4, end: 7, style: { fontName: bold } }]);
    expect(runsAfterEdit(text, 6, 11, 0)).toBeUndefined();
    // Replacing text inside the run keeps its style.
    expect(runsAfterEdit(text, 7, 9, 5)).toEqual([{ start: 6, end: 14, style: { fontName: bold } }]);
    // At the very start, inserted text takes the following character's style.
    expect(runsAfterEdit(node('Hi', [{ start: 0, end: 2, style: { fontSize: 20 } }]), 0, 0, 2)).toEqual([{ start: 0, end: 4, style: { fontSize: 20 } }]);
    expect(textChange('Hello world', 'Hello big world')).toEqual({ start: 6, end: 6, insertedLength: 4 });
    expect(textChange('aaa', 'aa')).toEqual({ start: 2, end: 3, insertedLength: 0 });
    expect(textChange('abc', 'xyz')).toEqual({ start: 0, end: 3, insertedLength: 3 });
  });

  test('clearing keys applies a layer-wide property over mixed ranges', () => {
    const text = node('abcdef', [{ start: 1, end: 3, style: { fontSize: 20, fontName: bold } }]);
    expect(clearRunKeys(text, ['fontSize'])).toEqual([{ start: 1, end: 3, style: { fontName: bold } }]);
    expect(clearRunKeys(text, ['fontSize', 'fontName'])).toBeUndefined();
  });
});
