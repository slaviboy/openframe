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
import type { Paint } from '../schema/document';
import { svgColor, svgPaint } from './svg-paint';

const red = { r: 1, g: 0, b: 0, a: 1 };
const blue = { r: 0, g: 0, b: 1, a: 0.5 };

describe('SVG paints', () => {
  test('a solid paint is a color, with its alpha and opacity as opacity', () => {
    expect(svgColor({ r: 1, g: 0.5, b: 0 })).toBe('#ff8000');
    expect(svgPaint({ type: 'SOLID', color: { ...red, a: 0.5 }, opacity: 0.5, visible: true, blendMode: 'NORMAL' }, 'p0')).toEqual({ value: '#ff0000', opacity: 0.25 });
    expect(svgPaint({ type: 'SOLID', color: red, opacity: 1, visible: false, blendMode: 'NORMAL' }, 'p0')).toBeNull();
  });

  test('linear and radial gradients are bounding-box gradient definitions with their transform and stops', () => {
    const stops = [
      { position: 0, color: red },
      { position: 1, color: blue },
    ];
    const linear = svgPaint({ type: 'GRADIENT_LINEAR', gradientStops: stops, gradientTransform: [0, 1, -1, 0, 1, 0], opacity: 0.8, visible: true, blendMode: 'NORMAL' } as Paint, 'g1')!;
    expect(linear.value).toBe('url(#g1)');
    expect(linear.opacity).toBe(0.8);
    expect(linear.definition).toBe(
      '<linearGradient id="g1" gradientUnits="objectBoundingBox" x1="0" y1="0.5" x2="1" y2="0.5" gradientTransform="matrix(0 1 -1 0 1 0)">' +
        '<stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff" stop-opacity="0.5"/></linearGradient>',
    );
    const radial = svgPaint({ type: 'GRADIENT_RADIAL', gradientStops: stops, gradientTransform: [1, 0, 0, 1, 0, 0], opacity: 1, visible: true, blendMode: 'NORMAL' } as Paint, 'g2')!;
    expect(radial.definition).toContain('<radialGradient id="g2" gradientUnits="objectBoundingBox" cx="0.5" cy="0.5" r="0.5" gradientTransform="matrix(1 0 0 1 0 0)">');

    expect(svgPaint({ type: 'GRADIENT_ANGULAR', gradientStops: stops, gradientTransform: [1, 0, 0, 1, 0, 0], opacity: 1, visible: true, blendMode: 'NORMAL' } as Paint, 'g3')).toBeNull();
  });
});
