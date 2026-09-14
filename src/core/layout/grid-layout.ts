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

/** The grid auto layout flow, as a pure function over boxes (no document access). */

import { clampSize, type FlowBox, type Padding, type SizeLimits, type Sizing } from './flow-layout';

/** A column or row size: fixed pixels, a fraction of the free space (fr), or hugging its cells' content. */
export type TrackSize = { readonly type: 'FIXED'; readonly value: number } | { readonly type: 'FLEX'; readonly value: number } | { readonly type: 'HUG' };
export type CellAlign = 'MIN' | 'CENTER' | 'MAX';

export interface GridContainer extends SizeLimits {
  readonly padding: Padding;
  readonly columnGap: number;
  readonly rowGap: number;
  readonly width: number;
  readonly height: number;
  readonly horizontalSizing: 'FIXED' | 'HUG';
  readonly verticalSizing: 'FIXED' | 'HUG';
  readonly columns: readonly TrackSize[];
  /** Explicit rows; more are added (sized like `autoRow`) when cells need them. */
  readonly rows: readonly TrackSize[];
  readonly autoRow: TrackSize;
  /** Place items in layer order into the next free cells; otherwise use each item's column and row. */
  readonly autoPlacement: boolean;
}

export interface GridItem extends SizeLimits {
  readonly width: number;
  readonly height: number;
  readonly horizontalSizing: Sizing;
  readonly verticalSizing: Sizing;
  readonly columnSpan: number;
  readonly rowSpan: number;
  /** Cell for manual placement (0-based). */
  readonly column?: number | undefined;
  readonly row?: number | undefined;
  readonly horizontalAlign: CellAlign;
  readonly verticalAlign: CellAlign;
}

export interface GridResult {
  readonly width: number;
  readonly height: number;
  /** Column and row tracks as start and length in the container's space. */
  readonly columns: readonly { readonly start: number; readonly length: number }[];
  readonly rows: readonly { readonly start: number; readonly length: number }[];
  /** Each item's cell (top-left of its span) and box. */
  readonly cells: readonly { readonly column: number; readonly row: number }[];
  readonly items: readonly FlowBox[];
}

const MAX_ROWS = 10_000;

/** Assigns every item a cell: in order into the first free cells from the last placement, or at its own column and row. */
function place(container: GridContainer, items: readonly GridItem[]): { column: number; row: number }[] {
  const columnCount = Math.max(1, container.columns.length);
  const taken = new Set<string>();
  const free = (column: number, row: number, columnSpan: number, rowSpan: number) => {
    for (let r = row; r < row + rowSpan; r++) for (let c = column; c < column + columnSpan; c++) if (taken.has(`${c},${r}`)) return false;
    return true;
  };
  const take = (column: number, row: number, columnSpan: number, rowSpan: number) => {
    for (let r = row; r < row + rowSpan; r++) for (let c = column; c < column + columnSpan; c++) taken.add(`${c},${r}`);
  };
  let cursor = { column: 0, row: 0 };
  return items.map((item) => {
    const columnSpan = Math.min(columnCount, Math.max(1, item.columnSpan));
    const rowSpan = Math.max(1, item.rowSpan);
    if (!container.autoPlacement && item.column !== undefined && item.row !== undefined) {
      const cell = { column: Math.min(columnCount - columnSpan, Math.max(0, item.column)), row: Math.min(MAX_ROWS, Math.max(0, item.row)) };
      take(cell.column, cell.row, columnSpan, rowSpan);
      return cell;
    }
    for (let row = cursor.row; row < MAX_ROWS; row++) {
      for (let column = row === cursor.row ? cursor.column : 0; column + columnSpan <= columnCount; column++) {
        if (free(column, row, columnSpan, rowSpan)) {
          take(column, row, columnSpan, rowSpan);
          cursor = { column: column + columnSpan, row };
          return { column, row };
        }
      }
    }
    return { column: 0, row: MAX_ROWS };
  });
}

/** Sizes tracks: fixed values, hug to their single-track cells' content, and fr shares of the rest (hugging when the container hugs). */
function sizeTracks(tracks: readonly TrackSize[], inner: number | null, gap: number, content: (index: number) => number): number[] {
  const sizes = tracks.map((track, i) => (track.type === 'FIXED' ? track.value : track.type === 'HUG' || inner === null ? content(i) : 0));
  if (inner === null) return sizes;
  const fr = tracks.reduce((total, track) => total + (track.type === 'FLEX' ? Math.max(0, track.value) : 0), 0);
  if (fr > 0) {
    const used = tracks.reduce((total, track, i) => total + (track.type === 'FLEX' ? 0 : sizes[i]!), 0) + gap * Math.max(0, tracks.length - 1);
    const unit = Math.max(0, inner - used) / fr;
    tracks.forEach((track, i) => {
      if (track.type === 'FLEX') sizes[i] = Math.max(0, track.value) * unit;
    });
  }
  return sizes;
}

const offsetFor = (free: number, align: CellAlign) => (align === 'CENTER' ? free / 2 : align === 'MAX' ? free : 0);

/**
 * Lays out items in a grid: items take cells in order (or their own cells), spanning columns and rows;
 * tracks are fixed, hug their content, or share the free space by fr; fill items stretch over their
 * cells and others align within them; hugging containers fit their tracks plus gaps and padding.
 */
export function layoutGrid(container: GridContainer, items: readonly GridItem[]): GridResult {
  const pad = container.padding;
  const columns = container.columns.length > 0 ? container.columns : [{ type: 'FLEX', value: 1 } as const];
  const cells = place({ ...container, columns }, items);
  const rowCount = Math.max(container.rows.length, ...cells.map((cell, i) => cell.row + Math.max(1, items[i]!.rowSpan)), 1);
  const rows = Array.from({ length: rowCount }, (_, i) => container.rows[i] ?? container.autoRow);

  const contentOf = (axis: 'column' | 'row') => (index: number) =>
    Math.max(
      0,
      ...items.map((item, i) => {
        const span = axis === 'column' ? item.columnSpan : item.rowSpan;
        if (cells[i]![axis] !== index || span > 1) return 0;
        return axis === 'column' ? clampSize(item.width, item.minWidth, item.maxWidth) : clampSize(item.height, item.minHeight, item.maxHeight);
      }),
    );
  const hugWidth = container.horizontalSizing === 'HUG';
  const hugHeight = container.verticalSizing === 'HUG';
  const innerWidth = hugWidth ? null : Math.max(0, container.width - pad.left - pad.right);
  const innerHeight = hugHeight ? null : Math.max(0, container.height - pad.top - pad.bottom);
  const columnSizes = sizeTracks(columns, innerWidth, container.columnGap, contentOf('column'));
  const rowSizes = sizeTracks(rows, innerHeight, container.rowGap, contentOf('row'));

  const total = (sizes: readonly number[], gap: number) => sizes.reduce((a, b) => a + b, 0) + gap * Math.max(0, sizes.length - 1);
  const width = Math.max(pad.left + pad.right, clampSize(hugWidth ? pad.left + pad.right + total(columnSizes, container.columnGap) : container.width, container.minWidth, container.maxWidth));
  const height = Math.max(pad.top + pad.bottom, clampSize(hugHeight ? pad.top + pad.bottom + total(rowSizes, container.rowGap) : container.height, container.minHeight, container.maxHeight));

  const starts = (sizes: readonly number[], first: number, gap: number) => {
    let position = first;
    return sizes.map((length) => {
      const track = { start: position, length };
      position += length + gap;
      return track;
    });
  };
  const columnTracks = starts(columnSizes, pad.left, container.columnGap);
  const rowTracks = starts(rowSizes, pad.top, container.rowGap);
  const span = (tracks: readonly { start: number; length: number }[], from: number, count: number) => {
    const first = tracks[Math.min(from, tracks.length - 1)]!;
    const last = tracks[Math.min(from + count - 1, tracks.length - 1)]!;
    return { start: first.start, length: last.start + last.length - first.start };
  };

  const boxes = items.map((item, i): FlowBox => {
    const cell = cells[i]!;
    const x = span(columnTracks, cell.column, Math.max(1, item.columnSpan));
    const y = span(rowTracks, cell.row, Math.max(1, item.rowSpan));
    const w = clampSize(item.horizontalSizing === 'FILL' ? x.length : item.width, item.minWidth, item.maxWidth);
    const h = clampSize(item.verticalSizing === 'FILL' ? y.length : item.height, item.minHeight, item.maxHeight);
    return { x: x.start + offsetFor(x.length - w, item.horizontalAlign), y: y.start + offsetFor(y.length - h, item.verticalAlign), width: w, height: h };
  });
  return { width, height, columns: columnTracks, rows: rowTracks, cells, items: boxes };
}
