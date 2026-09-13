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
import { solid } from '../document/factory';
import { PaintSchema, type PatternPaint } from '../schema/document';
import { convertPaint } from './paints';
import { patternLayout } from './pattern';

const base = convertPaint(solid({ r: 1, g: 0, b: 0, a: 1 }), 'PATTERN') as PatternPaint;

describe('pattern layout', () => {
  test('a new pattern paint is valid and has no source yet', () => {
    expect(PaintSchema.parse(base)).toEqual(base);
    expect(base.sourceNodeId).toBeUndefined();
    expect(convertPaint(base, 'SOLID').type).toBe('SOLID');
  });

  test('grid tiles are the scaled source plus spacing', () => {
    const layout = patternLayout({ ...base, scalingFactor: 2, spacing: { x: 4, y: 6 } }, { width: 10, height: 5 }, { width: 100, height: 100 })!;
    expect(layout.tile).toEqual({ width: 24, height: 16 });
    expect(layout.placements).toEqual([{ x: 0, y: 0 }]);
    expect(layout.origin).toEqual({ x: 0, y: 0 });
    expect(patternLayout(base, { width: 0, height: 5 }, { width: 10, height: 10 })).toBeNull();
  });

  test('hexagonal tiles offset alternate rows or columns by half a cell', () => {
    const horizontal = patternLayout({ ...base, tileType: 'HORIZONTAL_HEXAGONAL' }, { width: 20, height: 10 }, { width: 100, height: 100 })!;
    expect(horizontal.tile).toEqual({ width: 20, height: 20 });
    expect(horizontal.placements).toContainEqual({ x: 10, y: 10 });
    const vertical = patternLayout({ ...base, tileType: 'VERTICAL_HEXAGONAL' }, { width: 20, height: 10 }, { width: 100, height: 100 })!;
    expect(vertical.tile).toEqual({ width: 40, height: 10 });
    expect(vertical.placements).toContainEqual({ x: 20, y: 5 });
  });

  test('alignment anchors a tile to the left edge, the center or the right edge', () => {
    const layer = { width: 100, height: 50 };
    const source = { width: 30, height: 30 };
    expect(patternLayout({ ...base, horizontalAlignment: 'CENTER' }, source, layer)!.origin.x).toBe(5);
    expect(patternLayout({ ...base, horizontalAlignment: 'END' }, source, layer)!.origin.x).toBe(10);
  });
});
