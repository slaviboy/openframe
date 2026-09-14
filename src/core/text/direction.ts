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

import type { TextDirection } from '../schema/document';
import { paragraphAt, paragraphRanges, paragraphStyleOffset } from './paragraphs';
import { textStyleAt, type RunsNode } from './style-runs';

export type { TextDirection };

/** Characters of right-to-left scripts. */
const RTL_CHARACTER = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
const LETTER = /\p{L}/u;

/** Whether text contains any right-to-left script (the direction controls are offered then). */
export const containsRtl = (text: string): boolean => RTL_CHARACTER.test(text);

/** The direction of a paragraph from its first letter (the first strong character); left to right when it has none. */
export function detectDirection(text: string): 'LTR' | 'RTL' {
  for (const character of text) {
    if (RTL_CHARACTER.test(character)) return 'RTL';
    if (LETTER.test(character)) return 'LTR';
  }
  return 'LTR';
}

/** A paragraph's direction: its setting, or detected from its text when automatic. */
export const resolveDirection = (setting: TextDirection, paragraphText: string): 'LTR' | 'RTL' => (setting === 'AUTO' ? detectDirection(paragraphText) : setting);

/** The direction of the paragraph containing an offset. */
export function directionAt(node: RunsNode, offset: number): 'LTR' | 'RTL' {
  const range = paragraphAt(paragraphRanges(node.characters), offset);
  return resolveDirection(textStyleAt(node, paragraphStyleOffset(range)).textDirection, node.characters.slice(range.start, range.end));
}
