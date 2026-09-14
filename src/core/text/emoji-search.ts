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

/** An emoji record as the emoji dataset provides it (emojibase compact data). */
export interface EmojiRecord {
  readonly hexcode: string;
  readonly unicode: string;
  readonly label: string;
  readonly group?: number | undefined;
  readonly order?: number | undefined;
  readonly tags?: readonly string[] | undefined;
}

export interface EmojiEntry {
  readonly emoji: string;
  readonly name: string;
  readonly shortcodes: readonly string[];
  readonly tags: readonly string[];
  readonly order: number;
}

export type EmojiIndex = readonly EmojiEntry[];

/** The dataset group of skin tone and hair components, which aren't emoji on their own. */
const COMPONENT_GROUP = 2;

/** Emoji in display order with their shortcodes (hexcode → shortcode or shortcodes) and keywords. */
export function buildEmojiIndex(records: readonly EmojiRecord[], shortcodes: Readonly<Record<string, string | readonly string[]>>): EmojiEntry[] {
  return records
    .filter((r) => r.group !== undefined && r.group !== COMPONENT_GROUP && r.order !== undefined)
    .map((r) => {
      const codes = shortcodes[r.hexcode];
      return { emoji: r.unicode, name: r.label, shortcodes: codes === undefined ? [] : typeof codes === 'string' ? [codes] : [...codes], tags: r.tags ?? [], order: r.order! };
    })
    .sort((a, b) => a.order - b.order);
}

/**
 * The emoji search typed before the caret: a colon at the start of the text or after a space or
 * opening bracket, followed by at least two name characters (":he" searches, "10:30" doesn't).
 */
export function emojiQuery(before: string): { readonly query: string; readonly length: number } | null {
  const match = /(?:^|[\s([{]):([a-z0-9_+-]{2,32})$/i.exec(before);
  return match ? { query: match[1]!.toLowerCase(), length: match[1]!.length + 1 } : null;
}

/** Emoji matching a search, best first: shortcode matches, then name words, then keywords, then partial shortcodes. */
export function searchEmoji(index: EmojiIndex, query: string, limit = 8): EmojiEntry[] {
  const q = query.toLowerCase().replace(/^:|:$/g, '');
  if (!q) return [];
  const words = (text: string) => text.toLowerCase().split(/[\s_:-]+/);
  const scored: { entry: EmojiEntry; score: number }[] = [];
  for (const entry of index) {
    let score = -1;
    if (entry.shortcodes.includes(q)) score = 0;
    else if (entry.shortcodes.some((code) => code.startsWith(q))) score = 1;
    else if (words(entry.name).some((word) => word.startsWith(q))) score = 2;
    else if (entry.tags.some((tag) => tag.toLowerCase().startsWith(q))) score = 3;
    else if (entry.shortcodes.some((code) => code.includes(q))) score = 4;
    if (score >= 0) scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.entry.order - b.entry.order)
    .slice(0, limit)
    .map((s) => s.entry);
}
