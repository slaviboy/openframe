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

import { describe, expect, test } from 'vitest';
import { layoutGrid, type GridContainer, type GridItem } from './grid-layout';

const fr = (value = 1) => ({ type: 'FLEX', value }) as const;
const container = (patch: Partial<GridContainer> = {}): GridContainer => ({
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  columnGap: 10,
  rowGap: 10,
  width: 320,
  height: 210,
  horizontalSizing: 'FIXED',
  verticalSizing: 'FIXED',
  columns: [fr(), fr(), fr()],
  rows: [],
  autoRow: fr(),
  autoPlacement: true,
  ...patch,
});
const item = (patch: Partial<GridItem> = {}): GridItem => ({
  width: 50,
  height: 50,
  horizontalSizing: 'FIXED',
  verticalSizing: 'FIXED',
  columnSpan: 1,
  rowSpan: 1,
  horizontalAlign: 'MIN',
  verticalAlign: 'MIN',
  ...patch,
});

describe('grid layout', () => {
  test('items fill cells left to right, top to bottom; fr tracks share the space', () => {
    const r = layoutGrid(container(), [item(), item(), item(), item(), item()]);
    expect(r.columns.map((c) => c.length)).toEqual([100, 100, 100]);
    expect(r.rows).toEqual([
      { start: 0, length: 100 },
      { start: 110, length: 100 },
    ]);
    expect(r.cells).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 2, row: 0 },
      { column: 0, row: 1 },
      { column: 1, row: 1 },
    ]);
    expect(r.items[4]).toEqual({ x: 110, y: 110, width: 50, height: 50 });
  });

  test('spans, fill container and cell alignment', () => {
    const r = layoutGrid(container(), [item({ columnSpan: 2, horizontalSizing: 'FILL' }), item({ horizontalAlign: 'CENTER', verticalAlign: 'MAX' }), item({ rowSpan: 2, verticalSizing: 'FILL' })]);
    expect(r.items[0]).toEqual({ x: 0, y: 0, width: 210, height: 50 });
    // Three 1fr rows share 210 − 2 × 10: each is 63.33 tall.
    expect(r.rows).toHaveLength(3);
    expect(r.items[1]!.x).toBe(245);
    expect(r.items[1]!.y).toBeCloseTo(190 / 3 - 50);
    expect(r.cells[2]).toEqual({ column: 0, row: 1 });
    expect(r.items[2]!.height).toBeCloseTo((2 * 190) / 3 + 10);
  });

  test('fixed, hug and fr columns; hugging containers fit their tracks', () => {
    const r = layoutGrid(container({ columns: [{ type: 'FIXED', value: 80 }, { type: 'HUG' }, fr()], columnGap: 0, width: 300 }), [item(), item({ width: 40 }), item()]);
    expect(r.columns.map((c) => c.length)).toEqual([80, 40, 180]);
    const hug = layoutGrid(container({ horizontalSizing: 'HUG', verticalSizing: 'HUG', padding: { top: 5, right: 5, bottom: 5, left: 5 } }), [item(), item({ width: 70, height: 20 })]);
    // fr tracks hug in a hugging container: 50 + 10 + 70 + 10 + 0 (empty column).
    expect(hug.width).toBe(150);
    expect(hug.height).toBe(60);
  });

  test('manual placement keeps empty cells', () => {
    const r = layoutGrid(container({ autoPlacement: false }), [item({ column: 2, row: 1 }), item({ column: 9, row: 0 })]);
    expect(r.cells).toEqual([
      { column: 2, row: 1 },
      { column: 2, row: 0 },
    ]);
    expect(r.rows).toHaveLength(2);
  });
});
