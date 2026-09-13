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

import type { TextCase } from '../schema/document';

/**
 * Letter case: a non-destructive transform of how text is displayed (the stored characters stay as
 * typed). Small caps is an OpenType feature of the font rather than a change of characters.
 */

export const TEXT_CASE_LABELS: Record<TextCase, string> = {
  ORIGINAL: 'As typed',
  UPPER: 'Uppercase',
  LOWER: 'Lowercase',
  TITLE: 'Capitalize',
  SMALL_CAPS: 'Small caps',
};

let graphemes: Intl.Segmenter | null = null;
let words: Intl.Segmenter | null = null;

/** Transforms each grapheme, keeping one whose transform changes its length (so offsets stay aligned). */
function mapGraphemes(text: string, transform: (grapheme: string, index: number) => string): string {
  graphemes ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let out = '';
  for (const { segment, index } of graphemes.segment(text)) {
    const next = transform(segment, index);
    out += next.length === segment.length ? next : segment;
  }
  return out;
}

/**
 * The text as displayed with a letter case. The result always has the same UTF-16 length as the
 * input, so carets, selections and style runs keep their offsets: characters whose case changes
 * their length (such as ß → SS) are left as typed.
 */
export function applyTextCase(text: string, textCase: TextCase | undefined): string {
  switch (textCase) {
    case 'UPPER':
      return mapGraphemes(text, (g) => g.toLocaleUpperCase());
    case 'LOWER':
      return mapGraphemes(text, (g) => g.toLocaleLowerCase());
    case 'TITLE': {
      words ??= new Intl.Segmenter(undefined, { granularity: 'word' });
      const starts = new Set<number>();
      for (const { index, isWordLike } of words.segment(text)) if (isWordLike) starts.add(index);
      return mapGraphemes(text, (g, index) => (starts.has(index) ? g.toLocaleUpperCase() : g));
    }
    default:
      return text;
  }
}
