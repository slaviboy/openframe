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
import { draggedGap, draggedPadding, layoutHandles } from './layout-handles';

const padding = { top: 10, right: 20, bottom: 30, left: 40 };

describe('auto layout handles', () => {
  test('a handle per padding side and per gap between children', () => {
    const handles = layoutHandles({
      size: { width: 200, height: 100 },
      padding,
      direction: 'HORIZONTAL',
      wrap: false,
      autoGap: false,
      children: [
        { x: 40, y: 10, width: 50, height: 60 },
        { x: 100, y: 10, width: 50, height: 40 },
      ],
    });
    expect(handles).toEqual([
      { kind: 'padding', side: 'top', at: { x: 100, y: 5 } },
      { kind: 'padding', side: 'right', at: { x: 190, y: 50 } },
      { kind: 'padding', side: 'bottom', at: { x: 100, y: 85 } },
      { kind: 'padding', side: 'left', at: { x: 20, y: 50 } },
      { kind: 'gap', index: 0, at: { x: 95, y: 40 } },
    ]);
  });

  test('no gap handles for Auto gaps, wrapping flows or grids', () => {
    const base = { size: { width: 100, height: 100 }, padding, wrap: false, autoGap: false, children: [{ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 20, width: 10, height: 10 }] };
    expect(layoutHandles({ ...base, direction: 'VERTICAL' }).filter((h) => h.kind === 'gap')).toEqual([{ kind: 'gap', index: 0, at: { x: 5, y: 15 } }]);
    expect(layoutHandles({ ...base, direction: 'VERTICAL', autoGap: true })).toHaveLength(4);
    expect(layoutHandles({ ...base, direction: 'HORIZONTAL', wrap: true })).toHaveLength(4);
    expect(layoutHandles({ ...base, direction: 'GRID' })).toHaveLength(4);
  });

  test('dragging inward grows padding; Alt sets opposite sides, Alt+Shift all; steps snap; never below zero', () => {
    expect(draggedPadding(padding, 'top', { x: 0, y: 6 }, 'side')).toEqual({ ...padding, top: 16 });
    expect(draggedPadding(padding, 'right', { x: 5, y: 0 }, 'side')).toEqual({ ...padding, right: 15 });
    expect(draggedPadding(padding, 'left', { x: -12, y: 0 }, 'opposite')).toEqual({ ...padding, left: 28, right: 28 });
    expect(draggedPadding(padding, 'bottom', { x: 0, y: -4 }, 'all', 10)).toEqual({ top: 30, right: 30, bottom: 30, left: 30 });
    expect(draggedPadding(padding, 'top', { x: 0, y: -50 }, 'side').top).toBe(0);
  });

  test('dragging a gap handle along the flow changes the gap, which may go negative', () => {
    expect(draggedGap(10, 'HORIZONTAL', { x: 7, y: 30 })).toBe(17);
    expect(draggedGap(10, 'VERTICAL', { x: 7, y: -25 })).toBe(-15);
    expect(draggedGap(10, 'VERTICAL', { x: 0, y: 12 }, 10)).toBe(20);
  });
});
