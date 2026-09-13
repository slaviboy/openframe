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
import type { GradientPaint } from '../schema/document';
import { gradientHandles, gradientTransformFromHandles, positionOnGradient, stopPoint } from './gradient-handles';
import { convertPaint } from './paints';

const size = { width: 200, height: 100 };
const gradient = (type: GradientPaint['type']) => convertPaint(solid({ r: 1, g: 0, b: 0, a: 1 }), type) as GradientPaint;

describe('gradient handles', () => {
  test('the identity transform puts linear handles across the middle and radial handles at the center and edges', () => {
    const linear = gradientHandles(gradient('GRADIENT_LINEAR'), size);
    expect(linear.start).toEqual({ x: 0, y: 50 });
    expect(linear.end).toEqual({ x: 200, y: 50 });
    const radial = gradientHandles(gradient('GRADIENT_RADIAL'), size);
    expect(radial).toEqual({ start: { x: 100, y: 50 }, end: { x: 200, y: 50 }, width: { x: 100, y: 100 } });
  });

  test('handles round-trip through the transform', () => {
    for (const type of ['GRADIENT_LINEAR', 'GRADIENT_RADIAL', 'GRADIENT_ANGULAR', 'GRADIENT_DIAMOND'] as const) {
      const handles =
        type === 'GRADIENT_LINEAR'
          ? { start: { x: 100, y: 0 }, end: { x: 100, y: 100 }, width: { x: 0, y: 0 } }
          : { start: { x: 60, y: 40 }, end: { x: 160, y: 60 }, width: { x: 50, y: 90 } };
      const transform = gradientTransformFromHandles(type, handles, size)!;
      const back = gradientHandles({ ...gradient(type), gradientTransform: transform }, size);
      expect(back.start.x).toBeCloseTo(handles.start.x, 3);
      expect(back.start.y).toBeCloseTo(handles.start.y, 3);
      expect(back.end.x).toBeCloseTo(handles.end.x, 3);
      expect(back.end.y).toBeCloseTo(handles.end.y, 3);
      if (type !== 'GRADIENT_LINEAR') expect(back.width.x).toBeCloseTo(handles.width.x, 3);
    }
  });

  test('degenerate handles give no transform; stops project onto the gradient line', () => {
    expect(gradientTransformFromHandles('GRADIENT_LINEAR', { start: { x: 5, y: 5 }, end: { x: 5, y: 5 } }, size)).toBeNull();
    expect(gradientTransformFromHandles('GRADIENT_RADIAL', { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, width: { x: 20, y: 0 } }, size)).toBeNull();
    const handles = gradientHandles(gradient('GRADIENT_LINEAR'), size);
    expect(stopPoint(handles, 0.25)).toEqual({ x: 50, y: 50 });
    expect(positionOnGradient(handles, { x: 150, y: 90 })).toBe(0.75);
    expect(positionOnGradient(handles, { x: -40, y: 0 })).toBe(0);
  });
});
