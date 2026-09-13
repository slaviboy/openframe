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
 * Paragraph structure of a text layer's characters. Each line break ends a paragraph; the text
 * engine lays paragraphs out one below the other, which is where paragraph spacing, first-line
 * indents and (later) list markers come in.
 */

/** A paragraph: the characters [start, end) without its line break, and whether one follows. */
export interface ParagraphRange {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  /** A line break follows (every paragraph but the last). */
  readonly hasBreak: boolean;
}

/** The paragraphs of a text, in order. An empty text (or one ending in a line break) ends with an empty paragraph. */
export function paragraphRanges(text: string): ParagraphRange[] {
  const ranges: ParagraphRange[] = [];
  let start = 0;
  for (let index = 0; ; index++) {
    const breakAt = text.indexOf('\n', start);
    if (breakAt < 0) {
      ranges.push({ index, start, end: text.length, hasBreak: false });
      return ranges;
    }
    ranges.push({ index, start, end: breakAt, hasBreak: true });
    start = breakAt + 1;
  }
}

/** The paragraph containing a text offset (an offset right after a line break belongs to the next paragraph). */
export function paragraphAt(ranges: readonly ParagraphRange[], offset: number): ParagraphRange {
  for (const range of ranges) if (offset <= range.end) return range;
  return ranges[ranges.length - 1]!;
}

/**
 * Converts between offsets in the stored text and offsets in a paragraph as shaped, where
 * `prefix` characters (placeholders for an indent or list marker) come before the paragraph's own.
 */
export function toParagraphOffset(range: ParagraphRange, offset: number, prefix: number): number {
  return Math.min(range.end, Math.max(range.start, offset)) - range.start + prefix;
}

export function fromParagraphOffset(range: ParagraphRange, local: number, prefix: number): number {
  return Math.min(range.end, Math.max(range.start, range.start + local - prefix));
}

/**
 * Lines each paragraph may show under a max lines limit, given how many lines each has when laid
 * out without one: earlier paragraphs take their lines first; later ones get what is left, and a
 * paragraph with no lines left is hidden (0). Without a limit every paragraph keeps all its lines.
 */
export function lineBudgets(lineCounts: readonly number[], maxLines: number | undefined): number[] {
  if (maxLines === undefined) return [...lineCounts];
  let left = Math.max(0, maxLines);
  return lineCounts.map((count) => {
    const take = Math.min(count, left);
    left -= take;
    return take;
  });
}
