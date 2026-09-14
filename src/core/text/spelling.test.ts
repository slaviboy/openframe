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
import { misspelledRanges, misspelledWordAt, wordRanges, type SpellChecker } from './spelling';

const known = new Set(['i', 'receive', 'mail', 'the']);
const checker: SpellChecker = {
  correct: (word) => known.has(word.toLowerCase()),
  suggest: (word) => (word === 'recieve' ? ['receive'] : []),
};

describe('spelling', () => {
  test('words are split with offsets; numbers and abbreviations are skipped', () => {
    expect(wordRanges('I recieve 42 PDF mail, v2.')).toEqual([
      { start: 0, end: 1, word: 'I' },
      { start: 2, end: 9, word: 'recieve' },
      { start: 17, end: 21, word: 'mail' },
    ]);
  });

  test('misspelled words and the one at an offset', () => {
    const text = 'I recieve teh mail';
    expect(misspelledRanges(text, checker).map((r) => r.word)).toEqual(['recieve', 'teh']);
    expect(misspelledWordAt(text, 5, checker)?.word).toBe('recieve');
    expect(misspelledWordAt(text, 9, checker)?.word).toBe('recieve');
    expect(misspelledWordAt(text, 15, checker)).toBeNull();
  });
});
