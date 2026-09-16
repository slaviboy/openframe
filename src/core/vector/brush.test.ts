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
import type { VectorNetworkData } from '../schema/document';
import { brushOutline, brushStrokeOutlines } from './brush';
import { strokeChain } from './vector-width';

/** A 20 × 10 rectangle as a closed network: the shape a brush is made from. */
const shape: VectorNetworkData = {
  vertices: [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 10 },
    { x: 0, y: 10 },
  ],
  segments: [0, 1, 2, 3].map((i) => ({ start: i, end: (i + 1) % 4, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } })),
  regions: [],
};

/** A straight 100-unit path along x, as the Pencil would draw it. */
const path: VectorNetworkData = {
  vertices: [
    { x: 0, y: 50 },
    { x: 100, y: 50 },
  ],
  segments: [{ start: 0, end: 1, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } }],
  regions: [],
};

const size = { width: 20, height: 10 };
const chain = strokeChain(path)!;
const xs = (polygons: readonly (readonly { x: number; y: number }[])[]) => polygons.flat().map((p) => p.x);
const ys = (polygons: readonly (readonly { x: number; y: number }[])[]) => polygons.flat().map((p) => p.y);

describe('a custom brush on a stroke', () => {
  test('the shape becomes closed polygons of points', () => {
    const outline = brushOutline(shape);
    expect(outline).toHaveLength(1);
    expect(outline[0]!.length).toBeGreaterThan(4);
  });

  test('a stretch brush covers the whole path, as thick as the stroke', () => {
    const [polygon] = brushStrokeOutlines(chain, shape, size, 'STRETCH', 10);
    expect(polygon).toBeDefined();
    // Along the path from end to end, and 10 units thick around it.
    expect(Math.min(...xs([polygon!]))).toBeCloseTo(0, 5);
    expect(Math.max(...xs([polygon!]))).toBeCloseTo(100, 5);
    expect(Math.min(...ys([polygon!]))).toBeCloseTo(45, 5);
    expect(Math.max(...ys([polygon!]))).toBeCloseTo(55, 5);
  });

  test('a stretch brush scales with the stroke weight', () => {
    const thin = brushStrokeOutlines(chain, shape, size, 'STRETCH', 4);
    expect(Math.max(...ys(thin)) - Math.min(...ys(thin))).toBeCloseTo(4, 5);
  });

  test('a scatter brush repeats the shape along the path', () => {
    const copies = brushStrokeOutlines(chain, shape, size, 'SCATTER', 10);
    // A 20-wide shape at stroke weight 10 is 20 long, spaced 1.2 apart: a 100-unit path takes five of them.
    expect(copies.length).toBe(5);
    expect(Math.min(...ys(copies))).toBeCloseTo(45, 5);
    expect(Math.max(...ys(copies))).toBeCloseTo(55, 5);
    // The copies march along the path rather than sitting on top of each other.
    const centers = copies.map((polygon) => polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length);
    expect([...centers].sort((a, b) => a - b)).toEqual(centers);
    expect(centers.at(-1)! - centers[0]!).toBeGreaterThan(50);
  });

  test('nothing is painted without a stroke, a shape or a path', () => {
    expect(brushStrokeOutlines(chain, shape, size, 'STRETCH', 0)).toEqual([]);
    expect(brushStrokeOutlines(chain, { vertices: [], segments: [], regions: [] }, size, 'SCATTER', 10)).toEqual([]);
    expect(brushStrokeOutlines(chain, shape, { width: 0, height: 10 }, 'STRETCH', 10)).toEqual([]);
  });
});
