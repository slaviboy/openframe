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

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { subsetsFor, type SubsetTable } from './font-subsets';

const table: SubsetTable = [
  [0, '1f600-1f64f'],
  [1, '4e00-9fff'],
  [2, '2190,2192'],
];

describe('the subsets of a split font a text needs', () => {
  test('picks the subsets whose ranges cover the text, in table order', () => {
    expect(subsetsFor('😀', table)).toEqual([0]);
    expect(subsetsFor('世界', table)).toEqual([1]);
    expect(subsetsFor('←', table)).toEqual([2]);
    expect(subsetsFor('世 😀', table)).toEqual([0, 1]);
    // A single code point is a range of one.
    expect(subsetsFor('→', table)).toEqual([2]);
  });

  test('asks for nothing for ASCII, for an empty text, or for characters no subset covers', () => {
    expect(subsetsFor('Hello, world!', table)).toEqual([]);
    expect(subsetsFor('', table)).toEqual([]);
    expect(subsetsFor('Привет', table)).toEqual([]);
  });
});

/**
 * The colour emoji subsets the app really reads, out of the library on disk. Their declared ranges
 * were checked against the glyphs the files actually carry — 1,322 code points, no disagreement —
 * which is why they can be trusted to say what to load. See docs/FONTS.md.
 */
describe('the Noto Color Emoji subsets in the library', () => {
  interface EmojiFile {
    readonly file: string;
    readonly bytes: number;
    readonly unicodeRange?: string;
  }
  const files = JSON.parse(readFileSync(new URL('../../../public/fonts/google/noto-color-emoji/files.json', import.meta.url), 'utf8')) as EmojiFile[];
  const emoji: SubsetTable = files.map((f, i) => [i, (f.unicodeRange ?? '').replace(/U\+/gi, '').replace(/\s+/g, '')]);

  test('one emoji asks for one subset, a fraction of the whole font', () => {
    const picked = subsetsFor('😭', emoji);
    expect(picked).toHaveLength(1);
    // The font is 5.7 MB whole and the subsets 2.0 MB together; no one of them is most of that.
    expect(files[picked[0]!]!.bytes).toBeLessThan(1_000_000);
    expect(files.reduce((sum, f) => sum + f.bytes, 0)).toBeLessThan(3_000_000);
  });

  test('a text of many emoji asks for only the subsets they are in', () => {
    const picked = subsetsFor('😭😀👍🏽🇺🇸', emoji);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.length).toBeLessThan(files.length);
    // Plain text asks for none of them at all.
    expect(subsetsFor('Hello', emoji)).toEqual([]);
  });
});
