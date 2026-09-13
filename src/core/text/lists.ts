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
 * Bulleted and numbered lists. A paragraph is a list item when its list type isn't NONE; its
 * indentation level (1–5) sets how far it is indented and which counter style it uses.
 */

import type { ListType } from '../schema/document';

export type { ListType };

/** Deepest indentation level, as in the reference editor. */
export const MAX_LIST_LEVEL = 5;

/** A paragraph's list properties. */
export interface ListItem {
  readonly type: ListType;
  /** 1–5. */
  readonly level: number;
}

/** Lowercase letters counting like spreadsheet columns: 1 → a, 26 → z, 27 → aa. */
export function toAlphabetic(n: number): string {
  let value = Math.max(1, Math.floor(n));
  let out = '';
  while (value > 0) {
    const digit = (value - 1) % 26;
    out = String.fromCharCode(97 + digit) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

const ROMAN: readonly (readonly [number, string])[] = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

/** Lowercase roman numerals (1 → i, 4 → iv, 2026 → mmxxvi); numbers past 3999 fall back to digits. */
export function toRoman(n: number): string {
  let value = Math.max(1, Math.floor(n));
  if (value >= 4000) return String(value);
  let out = '';
  for (const [amount, numeral] of ROMAN) {
    while (value >= amount) {
      out += numeral;
      value -= amount;
    }
  }
  return out;
}

/**
 * The marker drawn before a list item. Bullets look the same at every level; numbered items count
 * with numbers, letters and roman numerals in turn as the level deepens.
 */
export function listMarker(item: ListItem, counter: number): string {
  if (item.type === 'UNORDERED') return '•';
  if (item.type === 'NONE') return '';
  switch ((clampLevel(item.level) - 1) % 3) {
    case 0:
      return `${counter}.`;
    case 1:
      return `${toAlphabetic(counter)}.`;
    default:
      return `${toRoman(counter)}.`;
  }
}

export const clampLevel = (level: number): number => Math.min(MAX_LIST_LEVEL, Math.max(1, Math.round(level)));

/**
 * The counter of each paragraph (0 for paragraphs that aren't numbered). Consecutive numbered items
 * count up per level; a deeper item starts its own count, and coming back to a shallower level
 * continues that level's count. A paragraph that isn't a list item, or a bulleted item at the same
 * level, restarts numbering.
 */
export function listCounters(items: readonly ListItem[]): number[] {
  const counts: number[] = [];
  return items.map((item) => {
    if (item.type === 'NONE') {
      counts.length = 0;
      return 0;
    }
    const level = clampLevel(item.level);
    // Deeper counters end when a shallower item appears.
    counts.length = Math.min(counts.length, level);
    if (item.type === 'UNORDERED') {
      counts[level - 1] = 0;
      return 0;
    }
    const next = (counts[level - 1] ?? 0) + 1;
    counts[level - 1] = next;
    return next;
  });
}

/**
 * A list typed at the start of a paragraph: "- " or "* " starts a bulleted list, "1. " or "1) " a
 * numbered one. `beforeCaret` is the paragraph's text up to the caret, just after typing a space.
 * Returns the list type and how many characters of the trigger to remove, or null.
 */
export function listTrigger(beforeCaret: string): { type: Exclude<ListType, 'NONE'>; length: number } | null {
  if (beforeCaret === '- ' || beforeCaret === '* ') return { type: 'UNORDERED', length: 2 };
  if (beforeCaret === '1. ' || beforeCaret === '1) ') return { type: 'ORDERED', length: 3 };
  return null;
}
