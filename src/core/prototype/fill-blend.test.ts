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
import type { Color, GradientPaint, ImagePaint, Paint, SolidPaint } from '../schema/document';
import { blendPaint } from './fill-blend';

const red: Color = { r: 1, g: 0, b: 0, a: 1 };
const green: Color = { r: 0, g: 1, b: 0, a: 1 };
const blue: Color = { r: 0, g: 0, b: 1, a: 1 };
const common = { opacity: 1, visible: true, blendMode: 'NORMAL' } as const;
const solid = (color: Color): SolidPaint => ({ type: 'SOLID', color, ...common });
const linear = (stops: [number, Color][], transform: GradientPaint['gradientTransform'] = [1, 0, 0, 1, 0, 0]): GradientPaint => ({
  type: 'GRADIENT_LINEAR',
  gradientStops: stops.map(([position, color]) => ({ position, color })),
  gradientTransform: transform,
  ...common,
});
const image = (hash: string, opacity = 1): ImagePaint => ({ type: 'IMAGE', imageHash: hash.repeat(64), scaleMode: 'FILL', ...common, opacity });
const stopsOf = (paints: Paint[]) => (paints[0] as GradientPaint).gradientStops;

describe('smart animating fills', () => {
  test('solid colors blend', () => {
    expect(blendPaint(solid(red), solid(blue), 0.5)).toEqual([solid({ r: 0.5, g: 0, b: 0.5, a: 1 })]);
  });

  test('a solid blends into a gradient along it, taking its kind and placement', () => {
    const blended = blendPaint(solid(red), linear([[0, red], [1, blue]]), 0.5);
    expect(blended).toHaveLength(1);
    expect(blended[0]!.type).toBe('GRADIENT_LINEAR');
    expect(stopsOf(blended)).toEqual([
      { position: 0, color: red },
      { position: 1, color: { r: 0.5, g: 0, b: 0.5, a: 1 } },
    ]);
  });

  test('gradients blend their colors at every stop of either, and their placement', () => {
    const from = linear([[0, red], [1, blue]]);
    const to = linear([[0, red], [0.5, green], [1, blue]], [2, 0, 0, 2, 0, 0]);
    const half = blendPaint(from, to, 0.5);
    expect(stopsOf(half).map((stop) => stop.position)).toEqual([0, 0.5, 1]);
    // Halfway along, the old gradient's purple and the new green meet.
    expect(stopsOf(half)[1]!.color).toEqual({ r: 0.25, g: 0.5, b: 0.25, a: 1 });
    expect((half[0] as GradientPaint).gradientTransform).toEqual([1.5, 0, 0, 1.5, 0, 0]);
    expect(stopsOf(blendPaint(from, to, 1))).toEqual(to.gradientStops);
  });

  test('image fills cross-fade, the new over the old, as opaque together as the blend of the two', () => {
    expect(blendPaint(image('a'), image('b'), 0.5)).toEqual([image('a', 1), image('b', 0.5)]);
    expect(blendPaint(image('a'), image('b'), 1)).toEqual([image('a', 0), image('b', 1)]);
    // Into a half-transparent image: at the end only it shows, at its own opacity.
    expect(blendPaint(image('a'), image('b', 0.5), 1)).toEqual([image('a', 0), image('b', 0.5)]);
    // A solid into an image cross-fades too; an unchanged image stays as it is.
    expect(blendPaint(solid(red), image('b'), 0.25).map((paint) => [paint.type, paint.opacity])).toEqual([
      ['SOLID', 1],
      ['IMAGE', 0.25],
    ]);
    expect(blendPaint(image('a'), image('a'), 0.5)).toEqual([image('a')]);
  });
});
