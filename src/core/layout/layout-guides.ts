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

import type { Color, LayoutGuide, Size } from '../schema/document';

export type LayoutGuidePattern = LayoutGuide['pattern'];
export type LayoutGuideAlignment = LayoutGuide['alignment'];

/** One column (along x) or row (along y) of a layout guide, in the frame's local space. */
export interface Band {
  readonly start: number;
  readonly length: number;
}

/** Red at 10% opacity. */
export const DEFAULT_LAYOUT_GUIDE_COLOR: Color = { r: 1, g: 0, b: 0, a: 0.1 };

/** Guides denser than this many lines per axis are not generated. */
const MAX_BANDS = 1000;

/** A new layout guide: a 10 px uniform grid, or five stretched columns or rows with 20 px gutters. */
export function defaultLayoutGuide(pattern: LayoutGuidePattern = 'GRID'): LayoutGuide {
  return pattern === 'GRID'
    ? { pattern, visible: true, color: DEFAULT_LAYOUT_GUIDE_COLOR, sectionSize: 10, count: null, alignment: 'STRETCH', gutterSize: 0, offset: 0 }
    : { pattern, visible: true, color: DEFAULT_LAYOUT_GUIDE_COLOR, sectionSize: 100, count: 5, alignment: 'STRETCH', gutterSize: 20, offset: 0 };
}

/** Changes a guide's type, keeping its color and visibility. */
export function convertLayoutGuide(guide: LayoutGuide, pattern: LayoutGuidePattern): LayoutGuide {
  if (guide.pattern === pattern) return guide;
  if (guide.pattern !== 'GRID' && pattern !== 'GRID') return { ...guide, pattern };
  return { ...defaultLayoutGuide(pattern), color: guide.color, visible: guide.visible };
}

/** How many `size` bands separated by `gutter` fit in `space` (Auto count). */
const fitCount = (space: number, size: number, gutter: number): number => Math.max(0, Math.floor((space + gutter) / (size + gutter) + 1e-9));

/**
 * The columns (of a `COLUMNS` guide, across `frame.width`) or rows (of a `ROWS` guide, across
 * `frame.height`). A uniform grid has no bands. Stretched bands with an Auto count use `sectionSize`
 * to decide how many fit, then share the space evenly.
 */
export function layoutGuideBands(guide: LayoutGuide, frame: Size): Band[] {
  if (guide.pattern === 'GRID') return [];
  const extent = guide.pattern === 'COLUMNS' ? frame.width : frame.height;
  const gutter = guide.gutterSize;
  if (guide.alignment === 'STRETCH') {
    const space = extent - 2 * guide.offset;
    if (space <= 0) return [];
    const count = Math.min(MAX_BANDS, guide.count ?? fitCount(space, guide.sectionSize, gutter));
    if (count === 0) return [];
    const length = (space - gutter * (count - 1)) / count;
    if (length <= 0) return [];
    return Array.from({ length: count }, (_, i) => ({ start: guide.offset + i * (length + gutter), length }));
  }
  const size = guide.sectionSize;
  const offset = guide.alignment === 'CENTER' ? 0 : guide.offset;
  const count = Math.min(MAX_BANDS, guide.count ?? fitCount(extent - offset, size, gutter));
  if (count === 0) return [];
  const total = count * size + (count - 1) * gutter;
  const first = guide.alignment === 'MIN' ? offset : guide.alignment === 'MAX' ? extent - offset - total : (extent - total) / 2;
  return Array.from({ length: count }, (_, i) => ({ start: first + i * (size + gutter), length: size }));
}

/** The uniform grid's line positions along one axis of `extent`, excluding the frame edges. */
export function gridLines(guide: LayoutGuide, extent: number): number[] {
  if (guide.pattern !== 'GRID' || guide.sectionSize <= 0) return [];
  const lines: number[] = [];
  for (let v = guide.sectionSize; v < extent - 1e-9 && lines.length < MAX_BANDS; v += guide.sectionSize) lines.push(v);
  return lines;
}

/**
 * The band that a layer's constraints follow along one axis while its frame goes from `before` to
 * `after`: with a stretched column (x) or row (y) guide, the column or row the layer's center is in,
 * or else the nearest one. Fixed guides and uniform grids leave constraints relative to the frame.
 */
export function constraintBand(
  guides: readonly LayoutGuide[] | undefined,
  axis: 'x' | 'y',
  start: number,
  length: number,
  before: Size,
  after: Size,
): { before: Band; after: Band } | null {
  const guide = guides?.find((g) => g.pattern === (axis === 'x' ? 'COLUMNS' : 'ROWS') && g.alignment === 'STRETCH');
  if (!guide) return null;
  const bandsBefore = layoutGuideBands(guide, before);
  const bandsAfter = layoutGuideBands(guide, after);
  if (bandsBefore.length === 0 || bandsBefore.length !== bandsAfter.length) return null;
  const center = start + length / 2;
  let index = 0;
  let best = Infinity;
  bandsBefore.forEach((band, i) => {
    const distance = center < band.start ? band.start - center : center > band.start + band.length ? center - band.start - band.length : 0;
    if (distance < best) {
      best = distance;
      index = i;
    }
  });
  return { before: bandsBefore[index]!, after: bandsAfter[index]! };
}
