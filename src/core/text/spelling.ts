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

/** Checks the spelling of single words (implemented with a Hunspell dictionary in the app). */
export interface SpellChecker {
  correct(word: string): boolean;
  suggest(word: string): string[];
}

export interface WordRange {
  readonly start: number;
  readonly end: number;
  readonly word: string;
}

const segmenter = new Intl.Segmenter('en', { granularity: 'word' });

/** The words of a text with their offsets; numbers, words with digits and all-caps abbreviations aren't checked. */
export function wordRanges(text: string): WordRange[] {
  const words: WordRange[] = [];
  for (const segment of segmenter.segment(text)) {
    if (!segment.isWordLike) continue;
    const word = segment.segment;
    if (/\d/.test(word) || (word.length > 1 && word === word.toUpperCase())) continue;
    words.push({ start: segment.index, end: segment.index + word.length, word });
  }
  return words;
}

/** The words a checker doesn't know. */
export function misspelledRanges(text: string, checker: SpellChecker): WordRange[] {
  return wordRanges(text).filter((range) => !checker.correct(range.word));
}

/** The misspelled word containing a text offset (a caret right after a word counts), or null. */
export function misspelledWordAt(text: string, offset: number, checker: SpellChecker): WordRange | null {
  return misspelledRanges(text, checker).find((range) => offset >= range.start && offset <= range.end) ?? null;
}
