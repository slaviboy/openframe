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
import {
  caret,
  deleteBackward,
  deleteForward,
  moveHorizontal,
  nextGrapheme,
  nextWord,
  paragraphRangeAt,
  previousGrapheme,
  previousWord,
  replaceSelection,
  wordRangeAt,
} from './text-editing';

describe('text editing', () => {
  test('typing replaces the selection and puts the caret after the insertion', () => {
    expect(replaceSelection('Hello world', { anchor: 6, focus: 11 }, 'there')).toEqual({ text: 'Hello there', selection: caret(11) });
    expect(replaceSelection('Hi', caret(2), '!')).toEqual({ text: 'Hi!', selection: caret(3) });
    // A backwards selection behaves the same.
    expect(replaceSelection('abcd', { anchor: 3, focus: 1 }, 'X').text).toBe('aXd');
  });

  test('backspace and delete remove whole graphemes, words or paragraphs', () => {
    const family = 'a👨‍👩‍👧b';
    expect(previousGrapheme(family, family.length - 1)).toBe(1);
    expect(nextGrapheme(family, 1)).toBe(family.length - 1);
    expect(deleteBackward(family, caret(family.length - 1)).text).toBe('ab');
    expect(deleteForward('éx', caret(0)).text).toBe('x');

    expect(deleteBackward('Hello big world', caret(9), 'word')).toEqual({ text: 'Hello  world', selection: caret(6) });
    expect(deleteForward('Hello big world', caret(6), 'word').text).toBe('Hello  world');
    expect(deleteBackward('one\ntwo three', caret(13), 'paragraph')).toEqual({ text: 'one\n', selection: caret(4) });
    // At a paragraph start, ⌘⌫ joins with the previous paragraph.
    expect(deleteBackward('one\ntwo', caret(4), 'paragraph').text).toBe('onetwo');
    expect(deleteBackward('', caret(0))).toEqual({ text: '', selection: caret(0) });
    expect(deleteBackward('abc', { anchor: 0, focus: 3 }).text).toBe('');
  });

  test('word and paragraph ranges', () => {
    const text = 'Hello, big world\nSecond line';
    expect(wordRangeAt(text, 8)).toEqual([7, 10]);
    expect(wordRangeAt(text, 5)).toEqual([5, 6]);
    expect(previousWord(text, 9)).toBe(7);
    expect(nextWord(text, 5)).toBe(10);
    expect(paragraphRangeAt(text, 3)).toEqual([0, 16]);
    expect(paragraphRangeAt(text, 20)).toEqual([17, 28]);
    expect(paragraphRangeAt(text, 17)).toEqual([17, 28]);
  });

  test('arrow keys move, extend and collapse selections', () => {
    const text = 'one two';
    expect(moveHorizontal(text, caret(3), 1, { extend: false, word: false })).toEqual(caret(4));
    expect(moveHorizontal(text, caret(3), 1, { extend: true, word: false })).toEqual({ anchor: 3, focus: 4 });
    expect(moveHorizontal(text, { anchor: 1, focus: 5 }, -1, { extend: false, word: false })).toEqual(caret(1));
    expect(moveHorizontal(text, caret(0), 1, { extend: false, word: true })).toEqual(caret(3));
    expect(moveHorizontal(text, caret(0), -1, { extend: false, word: false })).toEqual(caret(0));
  });
});
