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

import type { Rect } from '../math/rect';

/** Gap used when the selection has no usable existing spacing. */
export const DEFAULT_TIDY_GAP = 10;

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * Tidy up (⌃⌥T): arranges rectangles into a grid with uniform spacing.
 *
 * Rows are formed by vertical overlap (reading order: top to bottom, then left to right).
 * Column widths and row heights are the largest item in each; items sit at the top-left of
 * their cell. Horizontal and vertical gaps are the median of the current non-negative gaps
 * between neighbors (or `DEFAULT_TIDY_GAP`). The grid starts at the selection's top-left
 * corner; positions are whole pixels. Returns the new top-left corner of each input rect, in
 * input order.
 */
export function tidyLayout(rects: readonly Rect[]): { x: number; y: number }[] {
  if (rects.length === 0) return [];
  const order = rects.map((rect, index) => ({ rect, index })).sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);

  const rows: (typeof order)[] = [];
  let rowBottom = -Infinity;
  for (const item of order) {
    const center = item.rect.y + item.rect.height / 2;
    const row = rows.at(-1);
    if (row && center <= rowBottom) {
      row.push(item);
      rowBottom = Math.max(rowBottom, item.rect.y + item.rect.height);
    } else {
      rows.push([item]);
      rowBottom = item.rect.y + item.rect.height;
    }
  }
  for (const row of rows) row.sort((a, b) => a.rect.x - b.rect.x || a.rect.y - b.rect.y);

  const hGaps: number[] = [];
  for (const row of rows) {
    for (let i = 1; i < row.length; i++) {
      const gap = row[i]!.rect.x - (row[i - 1]!.rect.x + row[i - 1]!.rect.width);
      if (gap >= 0) hGaps.push(gap);
    }
  }
  const vGaps: number[] = [];
  for (let r = 1; r < rows.length; r++) {
    const prevBottom = Math.max(...rows[r - 1]!.map((i) => i.rect.y + i.rect.height));
    const top = Math.min(...rows[r]!.map((i) => i.rect.y));
    if (top - prevBottom >= 0) vGaps.push(top - prevBottom);
  }
  const gapX = Math.round(median(hGaps) ?? median(vGaps) ?? DEFAULT_TIDY_GAP);
  const gapY = Math.round(median(vGaps) ?? median(hGaps) ?? DEFAULT_TIDY_GAP);

  const columns = Math.max(...rows.map((row) => row.length));
  const colWidth = Array.from({ length: columns }, (_, c) => Math.max(0, ...rows.map((row) => row[c]?.rect.width ?? 0)));
  const rowHeight = rows.map((row) => Math.max(...row.map((i) => i.rect.height)));

  const originX = Math.round(Math.min(...rects.map((r) => r.x)));
  const originY = Math.round(Math.min(...rects.map((r) => r.y)));
  const out: { x: number; y: number }[] = new Array(rects.length);
  let y = originY;
  rows.forEach((row, r) => {
    let x = originX;
    row.forEach((item, c) => {
      out[item.index] = { x, y };
      x += Math.ceil(colWidth[c]!) + gapX;
    });
    y += Math.ceil(rowHeight[r]!) + gapY;
  });
  return out;
}
