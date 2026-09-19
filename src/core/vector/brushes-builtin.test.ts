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
import { isId } from '../ids/ids';
import type { Node } from '../schema/document';
import { brushStrokeOutlines } from './brush';
import { brushById, BUILTIN_BRUSHES, isBuiltinBrush } from './brushes-builtin';
import { strokeChain } from './vector-width';

/** A straight 100-unit path, the stroke a brush is laid along. */
const chain = strokeChain({
  vertices: [
    { x: 0, y: 50 },
    { x: 100, y: 50 },
  ],
  segments: [{ start: 0, end: 1, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } }],
  regions: [],
})!;

describe('the brushes every file has', () => {
  test('there are shapes of both kinds, each named and closed', () => {
    expect(BUILTIN_BRUSHES.filter((brush) => brush.brushKind === 'STRETCH').length).toBeGreaterThan(2);
    expect(BUILTIN_BRUSHES.filter((brush) => brush.brushKind === 'SCATTER').length).toBeGreaterThan(2);
    for (const brush of BUILTIN_BRUSHES) {
      expect(brush.name).not.toBe('');
      expect(brush.size.width).toBeGreaterThan(0);
      expect(brush.size.height).toBeGreaterThan(0);
      // A brush is filled, so its shape has to close: every point joins two segments.
      const degree = new Map<number, number>();
      for (const segment of brush.vectorNetwork.segments) {
        degree.set(segment.start, (degree.get(segment.start) ?? 0) + 1);
        degree.set(segment.end, (degree.get(segment.end) ?? 0) + 1);
      }
      expect([...degree.values()].every((count) => count === 2)).toBe(true);
    }
    // Their ids are their own and are ids a file can hold, so a layer that names one still reads back
    // after a save; the `0` replica is the root's, which no editing session takes.
    expect(new Set(BUILTIN_BRUSHES.map((brush) => brush.id)).size).toBe(BUILTIN_BRUSHES.length);
    for (const brush of BUILTIN_BRUSHES) {
      expect(isId(brush.id)).toBe(true);
      expect(brush.id.startsWith('0:')).toBe(true);
    }
  });

  test('each of them paints a stroke', () => {
    for (const brush of BUILTIN_BRUSHES) {
      const polygons = brushStrokeOutlines(chain, brush.vectorNetwork, brush.size, brush.brushKind, 10);
      expect(polygons.length).toBeGreaterThan(0);
      const xs = polygons.flat().map((p) => p.x);
      // The ink covers the path it is laid along rather than sitting in a heap at one end.
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(50);
    }
  });

  test('an id finds one of these before it looks in the file, and a file’s own brush still resolves', () => {
    const own = { id: 'own', type: 'BRUSH', name: 'Mine' } as unknown as Node;
    const store = { get: (id: string) => (id === 'own' ? own : undefined) };
    const first = BUILTIN_BRUSHES[0]!;
    expect(brushById(store, first.id)).toBe(first);
    expect(brushById(store, 'own')).toBe(own);
    expect(brushById(store, 'nothing')).toBeUndefined();
    expect(isBuiltinBrush(first.id)).toBe(true);
    expect(isBuiltinBrush('own')).toBe(false);
  });
});
