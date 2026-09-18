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
import type { Rect } from '../math/rect';
import { detectSmartGrid, detectSmartSelection, gridOrder, gridSlots, gridSpacingHandles, respace, respaceGrid, spacingHandles, swapPositions } from './smart-selection';

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('smart selection', () => {
  test('a row with equal gaps is detected regardless of input order and sizes', () => {
    const rects = [r(120, 0, 40, 60), r(0, 0, 50, 50), r(70, 10, 30, 30)];
    expect(detectSmartSelection(rects)).toEqual({ axis: 'x', order: [1, 2, 0], gap: 20 });
  });

  test('columns are detected; unequal gaps, missing overlap or a single layer are not smart', () => {
    expect(detectSmartSelection([r(0, 0, 50, 20), r(10, 30, 40, 20), r(0, 60, 50, 20)])).toMatchObject({ axis: 'y', gap: 10 });
    expect(detectSmartSelection([r(0, 0, 10, 10), r(20, 0, 10, 10), r(45, 0, 10, 10)])).toBeNull();
    expect(detectSmartSelection([r(0, 0, 10, 10), r(20, 50, 10, 10)])).toBeNull();
    expect(detectSmartSelection([r(0, 0, 10, 10)])).toBeNull();
    // Gaps within half a pixel still count as equal.
    expect(detectSmartSelection([r(0, 0, 10, 10), r(20, 0, 10, 10), r(40.4, 0, 10, 10)])).not.toBeNull();
  });

  test('respace keeps the first layer and the cross positions', () => {
    const rects = [r(0, 0, 50, 50), r(70, 10, 30, 30), r(120, 0, 40, 60)];
    const selection = detectSmartSelection(rects)!;
    expect(respace(rects, selection, 5)).toEqual([
      { x: 0, y: 0 },
      { x: 55, y: 10 },
      { x: 90, y: 0 },
    ]);
    expect(respace(rects, selection, -10)[1]).toEqual({ x: 50, y: 10 });
  });

  test('spacing handles sit in the middle of each gap', () => {
    const rects = [r(0, 0, 50, 50), r(70, 10, 30, 30)];
    expect(spacingHandles(rects, detectSmartSelection(rects)!)).toEqual([{ x: 60, y: 25 }]);
  });
});

describe('a grid of layers', () => {
  /** Four 40-squares in a 2 × 2 grid with 20 between them. */
  const grid: Rect[] = [
    { x: 0, y: 0, width: 40, height: 40 },
    { x: 60, y: 0, width: 40, height: 40 },
    { x: 0, y: 60, width: 40, height: 40 },
    { x: 60, y: 60, width: 40, height: 40 },
  ];

  test('rows and gaps are read off the layers', () => {
    expect(detectSmartGrid(grid)).toEqual({
      rows: [
        [0, 1],
        [2, 3],
      ],
      columnGap: 20,
      rowGap: 20,
    });
  });

  test('a row or a column on its own is not a grid', () => {
    expect(detectSmartGrid(grid.slice(0, 2))).toBeNull();
    expect(detectSmartGrid([grid[0]!, grid[2]!])).toBeNull();
  });

  test('rows of different lengths, or uneven gaps, are not a grid', () => {
    expect(detectSmartGrid([...grid, { x: 120, y: 0, width: 40, height: 40 }])).toBeNull();
    const uneven = [...grid];
    uneven[3] = { x: 80, y: 60, width: 40, height: 40 };
    expect(detectSmartGrid(uneven)).toBeNull();
  });

  test('columns that do not line up are not a grid', () => {
    const stepped = [...grid];
    stepped[2] = { x: 10, y: 60, width: 40, height: 40 };
    stepped[3] = { x: 70, y: 60, width: 40, height: 40 };
    expect(detectSmartGrid(stepped)).toBeNull();
  });

  test('the places are read row by row, and asking for more carries on below the grid', () => {
    const detected = detectSmartGrid(grid)!;
    expect(gridOrder(detected)).toEqual([0, 1, 2, 3]);
    expect(gridSlots(grid, detected)).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 0, y: 60 },
      { x: 60, y: 60 },
    ]);
    // A fifth place starts a third row, a row gap below the second.
    expect(gridSlots(grid, detected, 6).slice(4)).toEqual([
      { x: 0, y: 120 },
      { x: 60, y: 120 },
    ]);
  });

  test('both gaps can be set at once, the first layer staying where it is', () => {
    const detected = detectSmartGrid(grid)!;
    expect(respaceGrid(grid, detected, 10, 30)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 0, y: 70 },
      { x: 50, y: 70 },
    ]);
  });

  test('a handle sits in the middle of every gap, saying which one it changes', () => {
    const detected = detectSmartGrid(grid)!;
    expect(gridSpacingHandles(grid, detected)).toEqual([
      { point: { x: 50, y: 20 }, axis: 'x' },
      { point: { x: 50, y: 80 }, axis: 'x' },
      { point: { x: 20, y: 50 }, axis: 'y' },
      { point: { x: 80, y: 50 }, axis: 'y' },
    ]);
  });

  test('two layers exchange places, each keeping its own size', () => {
    const rects: Rect[] = [
      { x: 0, y: 0, width: 40, height: 40 },
      { x: 60, y: 10, width: 20, height: 20 },
    ];
    expect(swapPositions(rects, 0, 1)).toEqual([
      { x: 60, y: 10 },
      { x: 0, y: 0 },
    ]);
    // Swapping a layer with itself changes nothing.
    expect(swapPositions(rects, 1, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 10 },
    ]);
  });
});
