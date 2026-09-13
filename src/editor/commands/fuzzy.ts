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
 * Fuzzy matching for the command palette and search fields.
 *
 * Every query character must appear in the text in order (case-insensitive). Matches
 * score higher when they start a word or continue the previous match, and lower when
 * they are far apart, so "grp" ranks "Group selection" above "Show/hide groups preview".
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return 0;
  const t = text.toLowerCase();
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    const index = t.indexOf(ch, from);
    if (index < 0) return null;
    score += 1;
    if (isWordStart(text, index)) score += 3;
    if (index === previous + 1) score += 2;
    else if (previous >= 0) score -= Math.min(3, (index - previous - 1) * 0.1);
    previous = index;
    from = index + 1;
  }
  // Prefer shorter texts when scores tie (a closer overall match).
  return score - text.length * 0.001;
}

function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true;
  const prev = text[index - 1]!;
  const cur = text[index]!;
  return /[\s\-_/.(]/.test(prev) || (prev === prev.toLowerCase() && cur !== cur.toLowerCase());
}

/** Items whose text matches, best first; ties keep the original order. */
export function fuzzyFilter<T>(items: readonly T[], query: string, getText: (item: T) => string): T[] {
  return items
    .map((item, order) => ({ item, order, score: fuzzyScore(query, getText(item)) }))
    .filter((entry): entry is { item: T; order: number; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => entry.item);
}
