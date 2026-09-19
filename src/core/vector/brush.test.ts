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
import { brushOutline, brushStrokeOutlines, DEFAULT_BRUSH_SETTINGS } from './brush';
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

  /** A scatter brush with nothing given away to chance: every copy as the shape itself. */
  const still = { settings: { sizeJitter: 0, angularJitter: 0, wiggle: 0 } };

  test('a scatter brush repeats the shape along the path', () => {
    const copies = brushStrokeOutlines(chain, shape, size, 'SCATTER', 10, still);
    // A 20-wide shape at stroke weight 10 is 20 long, a quarter of itself apart: five fit a 100-unit path.
    expect(copies.length).toBe(5);
    expect(Math.min(...ys(copies))).toBeCloseTo(45, 5);
    expect(Math.max(...ys(copies))).toBeCloseTo(55, 5);
    // The copies march along the path rather than sitting on top of each other.
    const centers = copies.map((polygon) => polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length);
    expect([...centers].sort((a, b) => a - b)).toEqual(centers);
    expect(centers.at(-1)! - centers[0]!).toBeGreaterThan(50);
  });

  test('the gap sets how far apart the copies are laid', () => {
    const tight = brushStrokeOutlines(chain, shape, size, 'SCATTER', 10, { settings: { ...still.settings, gap: 0 } });
    const loose = brushStrokeOutlines(chain, shape, size, 'SCATTER', 10, { settings: { ...still.settings, gap: 200 } });
    expect(tight.length).toBeGreaterThan(loose.length);
  });

  test('the jitters move, resize and turn each copy, and do it the same way on every draw', () => {
    const scattered = brushStrokeOutlines(chain, shape, size, 'SCATTER', 10);
    expect(scattered).toEqual(brushStrokeOutlines(chain, shape, size, 'SCATTER', 10));
    // The defaults turn a copy any way it likes and vary its size, so the copies reach past the stroke's
    // own width, which a still one never does.
    expect(Math.max(...ys(scattered))).toBeGreaterThan(55);
    const sized = brushStrokeOutlines(chain, shape, size, 'SCATTER', 10, { settings: { ...still.settings, sizeJitter: 90 } });
    const widths = sized.map((polygon) => Math.max(...polygon.map((p) => p.x)) - Math.min(...polygon.map((p) => p.x)));
    expect(new Set(widths.map((w) => w.toFixed(2))).size).toBeGreaterThan(1);
    // Wiggle carries a copy off the line it is laid along.
    const wiggled = brushStrokeOutlines(chain, shape, size, 'SCATTER', 10, { settings: { ...still.settings, wiggle: 100 } });
    expect(Math.max(...ys(wiggled))).toBeGreaterThan(55);
  });

  test('a stretch brush can be laid the other way along the path', () => {
    // A wedge: thick where the shape starts, a point where it ends.
    const wedge: VectorNetworkData = {
      vertices: [
        { x: 0, y: 0 },
        { x: 20, y: 5 },
        { x: 0, y: 10 },
      ],
      segments: [0, 1, 2].map((i) => ({ start: i, end: (i + 1) % 3, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } })),
      regions: [],
    };
    const thickAt = (polygons: readonly (readonly { x: number; y: number }[])[], x: number) => {
      const near = polygons.flat().filter((p) => Math.abs(p.x - x) < 6);
      return Math.max(...near.map((p) => p.y)) - Math.min(...near.map((p) => p.y));
    };
    const forward = brushStrokeOutlines(chain, wedge, size, 'STRETCH', 10);
    const backward = brushStrokeOutlines(chain, wedge, size, 'STRETCH', 10, { settings: { direction: 'REVERSE' } });
    expect(thickAt(forward, 5)).toBeGreaterThan(thickAt(forward, 95));
    expect(thickAt(backward, 5)).toBeLessThan(thickAt(backward, 95));
  });

  test('a stroke whose width varies carries the brush with it', () => {
    // Half the weight at the end of the path: the shape laid there is half as tall.
    const widths = [
      { position: 0, width: 10 },
      { position: 1, width: 2 },
    ];
    const tapered = brushStrokeOutlines(chain, shape, size, 'STRETCH', 10, { widths });
    const near = (x: number) => tapered.flat().filter((p) => Math.abs(p.x - x) < 6);
    const thickness = (x: number) => Math.max(...near(x).map((p) => p.y)) - Math.min(...near(x).map((p) => p.y));
    expect(thickness(2)).toBeGreaterThan(8);
    expect(thickness(98)).toBeLessThan(4);
  });

  test('a brush starts out as the reference sets its own', () => {
    expect(DEFAULT_BRUSH_SETTINGS).toEqual({ direction: 'FORWARD', gap: 25, wiggle: 0, sizeJitter: 30, angularJitter: 180, rotation: 0 });
  });

  test('nothing is painted without a stroke, a shape or a path', () => {
    expect(brushStrokeOutlines(chain, shape, size, 'STRETCH', 0)).toEqual([]);
    expect(brushStrokeOutlines(chain, { vertices: [], segments: [], regions: [] }, size, 'SCATTER', 10)).toEqual([]);
    expect(brushStrokeOutlines(chain, shape, { width: 0, height: 10 }, 'STRETCH', 10)).toEqual([]);
  });
});
