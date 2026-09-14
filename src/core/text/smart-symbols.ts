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

/** Character sequences replaced by a symbol when their last character is typed (Use smart quotes/symbols). */
export const SMART_SYMBOLS: readonly (readonly [string, string])[] = [
  ['->', '→'],
  ['<-', '←'],
  ['vv', '↓'],
  ['^^', '↑'],
  ['(c)', '©'],
  ['(r)', '®'],
  ['(tm)', '™'],
  ['[ ]', '▢'],
];

/** Characters after which a quote opens rather than closes. */
const OPENS_QUOTE = /[\s([{‘“]/u;

/**
 * The replacement for a typed character with smart quotes/symbols on: `remove` characters before the
 * caret and the typed character become `text`. Straight quotes become opening or closing curly
 * quotes by what precedes them; null when nothing changes.
 */
export function smartSymbol(before: string, typed: string): { readonly remove: number; readonly text: string } | null {
  if (typed === '"' || typed === "'") {
    const previous = before.slice(-1);
    const opening = previous === '' || OPENS_QUOTE.test(previous);
    return { remove: 0, text: typed === '"' ? (opening ? '“' : '”') : opening ? '‘' : '’' };
  }
  if (typed.length !== 1) return null;
  const tail = `${before}${typed}`.toLowerCase();
  for (const [sequence, symbol] of SMART_SYMBOLS) {
    if (sequence.endsWith(typed.toLowerCase()) && tail.endsWith(sequence)) return { remove: sequence.length - 1, text: symbol };
  }
  return null;
}
