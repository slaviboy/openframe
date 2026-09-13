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
import { PaintSchema, type GradientPaint, type Paint } from '../schema/document';
import { addStop, colorAt, convertPaint, removeStop, representativeColor, reverseStops, updateStop } from './paints';

const red = { r: 1, g: 0, b: 0, a: 1 };
const blue = { r: 0, g: 0, b: 1, a: 1 };
const solid: Paint = { type: 'SOLID', color: red, opacity: 0.8, visible: true, blendMode: 'MULTIPLY' };

describe('paint conversion', () => {
  test('solid → linear fades the color out and keeps opacity, visibility and blend mode', () => {
    const linear = convertPaint(solid, 'GRADIENT_LINEAR') as GradientPaint;
    expect(linear).toEqual({
      type: 'GRADIENT_LINEAR',
      gradientStops: [
        { position: 0, color: red },
        { position: 1, color: { ...red, a: 0 } },
      ],
      gradientTransform: [1, 0, 0, 1, 0, 0],
      opacity: 0.8,
      visible: true,
      blendMode: 'MULTIPLY',
    });
    expect(PaintSchema.safeParse(linear).success).toBe(true);
  });

  test('gradients keep stops across gradient types and become solids of their first stop', () => {
    const linear = convertPaint(solid, 'GRADIENT_LINEAR') as GradientPaint;
    const radial = convertPaint(linear, 'GRADIENT_RADIAL') as GradientPaint;
    expect(radial.type).toBe('GRADIENT_RADIAL');
    expect(radial.gradientStops).toEqual(linear.gradientStops);
    expect(convertPaint(radial, 'SOLID')).toEqual(solid);
    expect(representativeColor(radial)).toEqual(red);
    expect(convertPaint(solid, 'SOLID')).toBe(solid);
  });

  test('schema requires at least two stops', () => {
    const one = { ...(convertPaint(solid, 'GRADIENT_DIAMOND') as GradientPaint), gradientStops: [{ position: 0, color: red }] };
    expect(PaintSchema.safeParse(one).success).toBe(false);
  });
});

describe('gradient stops', () => {
  const gradient: GradientPaint = {
    type: 'GRADIENT_LINEAR',
    gradientStops: [
      { position: 1, color: blue },
      { position: 0, color: red },
    ],
    gradientTransform: [1, 0, 0, 1, 0, 0],
    opacity: 1,
    visible: true,
    blendMode: 'NORMAL',
  };

  test('colorAt interpolates between sorted stops', () => {
    expect(colorAt(gradient.gradientStops, 0.5)).toEqual({ r: 0.5, g: 0, b: 0.5, a: 1 });
    expect(colorAt(gradient.gradientStops, -1)).toEqual(red);
  });

  test('add, update, remove and reverse stops', () => {
    const added = addStop(gradient);
    expect(added.gradientStops.map((s) => s.position)).toEqual([0, 0.5, 1]);
    expect(added.gradientStops[1]!.color).toEqual({ r: 0.5, g: 0, b: 0.5, a: 1 });
    const moved = updateStop(added, 1, { position: 1.5 });
    expect(moved.gradientStops.map((s) => s.position)).toEqual([0, 1, 1]);
    expect(removeStop(added, 1).gradientStops).toHaveLength(2);
    expect(removeStop(gradient, 0).gradientStops).toHaveLength(2);
    expect(reverseStops(gradient).gradientStops[0]!.color).toEqual(blue);
  });
});
