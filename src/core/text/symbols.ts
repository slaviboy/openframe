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

/**
 * Symbols — arrows, mathematical operators, technical marks, box drawing, geometric shapes and
 * dingbats — which the bundled text fonts largely do not carry. Inter's Latin subset has ↑ and ↓
 * but not ← or →, so a symbol is drawn by a fallback font loaded for it (see docs/FONTS.md).
 */

/**
 * The blocks the symbol fallback fonts serve: Letterlike Symbols through Miscellaneous Symbols and
 * Arrows, and the mathematical alphanumerics. Written as numbers rather than as a character class:
 * the characters themselves are invisible in an editor, and one written literally into a file has
 * been silently dropped before.
 */
const SYMBOL_RANGES: readonly (readonly [number, number])[] = [
  [0x2100, 0x2bff],
  [0x1d400, 0x1d7ff],
];

/**
 * Whether text contains a character the symbol fallback fonts may have to draw. Whether it *needs*
 * them is a separate question, answered by probing the fonts already registered
 * (`TextShaper.uncoveredCodePoints`) — Inter carries ™ and ↑, which are in these ranges.
 */
export function containsSymbols(text: string): boolean {
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    if (SYMBOL_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi)) return true;
  }
  return false;
}
